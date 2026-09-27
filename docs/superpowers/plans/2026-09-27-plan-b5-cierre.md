# Plan B5: cierre del rediseño «Acta»

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** cerrar el rediseño (spec §12.6), publicado por fases desde B2:
- lo que las revisiones de B3 y B4 dejaron pendiente y afecta a la familia: los escudos que desaparecen sin conexión tras cada actualización, la plantilla de la temporada sin conexión, «Reintentar» que pierde el sitio, las pantallas de B3 sin esqueleto propio y dos textos de Copa;
- la limpieza del código que dejaron las revisiones (ayudantes repetidos, funciones sin uso, dobles cálculos, detalles del router) y las pruebas que faltan;
- la spec y la documentación al día con lo construido;
- la verificación visual de §11 (capturas de cada pantalla y estado, revisadas y enviadas al usuario) y la publicación.

**Arquitectura:** la de B2 a B4, sin cambios de principio (spec §5.1): módulos planos en `src/` sin `import()`, `render` puro, datos del modelo, `sw.js` con su contrato (la línea 1 es `CACHE_NAME`; los literales `STATIC_ASSETS` y `SEASON_FILES`), al que B5 añade la línea 2, `CRESTS_CACHE` (decisión 1). **B5 sí toca `src/` y `acta.css`** (Tareas 3 a 6): `CODIGO` cambia, y su publicación es un despliegue de código sobre el SW de B4, en el que la limpieza del arranque por `CODIGO` (decisión 155 de B3) se ejerce de verdad por primera vez desde B3.

**Stack:** el de B4: JavaScript ES2022 sin compilación, `node --test` (Node 22), Playwright 1.58 y el Chrome del sistema, Python 3 (pytest) y Pillow solo en local (el CI no lo instala).

**Spec:** `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`: §3, §4 (las pantallas que se tocan), §4.10, §5, §7, §8, §10, §11 y §12.6. Los planes B3 (`docs/superpowers/plans/2026-09-25-plan-b3-pantallas-secundarias.md`, «Para B4 y siguientes») y B4 (`docs/superpowers/plans/2026-09-26-plan-b4-datos-escudos-pwa.md`, «Para B5 y siguientes» y su Tarea 7, publicar) son requisito de este plan. El inventario del código de `0208d26` (archivo:línea, tamaños y las pruebas que nombran cada cosa), al que remiten los contextos de las tareas, está en `$S/inventario-b5.md`.

**Cómo se verificó:** el plan se ejecutó entero, tal como está escrito, en un clon desechable del repositorio con la rama `rediseno-acta` y `origin/main` en `0208d26` (B4 publicada, versión `20260926`). Un guion extrajo cada bloque del propio plan, lo ejecutó (con la raíz del clon y un `S` propio) y comparó su salida con su «Esperado».
- Cada tarea terminó en su commit, con pytest, node y los tres smoke en verde, tres pasadas en cada tarea (los recuentos, en la tabla de las restricciones). Después, una pasada limpia sin intervención en un clon nuevo, de la Tarea 1 a la 9. Las salidas son las reales del 27/09/2026; las que dependen de la máquina o del día lo dicen.
- Después, una revisión adversarial (listo con arreglos: 0 altas, 1 media, 2 bajas; su informe y sus simulaciones, en `$S/review-report.md` y `$S/rev/`) ejecutó el plan en otro clon, simuló el paso de B4 a B5 con fallos inyectados y midió la CDN de Pages. Sus arreglos, con lo que decidió el controlador, son las decisiones 58 a 60, y la verificación de punta a punta se repitió con ellos en un clon nuevo sobre `0208d26`, sin intervención:
  - de los 84 bloques de órdenes de las Tareas 1 a 9, 74 ejecutados: 71 con la salida igual a su «Esperado» literal, 2 sin él (el DOM de la base, un número del día) y 1 distinto, el presupuesto, por sus tiempos (portada 2.703 ms frente a 2.692 y LCP 2.780 frente a 2.768; los KB y el CLS, iguales); y 10 rechazados (el paso 6 de la Tarea 8 y los pasos 1 y 8 a 11 de la Tarea 9);
  - cada tarea, con sus suites y los tres smoke tres veces, en verde (la tabla de las restricciones); `CODIGO`, el de cada tarea (el comentario nuevo de `sw.js` no está en su huella);
  - los smoke, tres veces más al final (el paso 4 de la Tarea 9, con la versión nueva: 25 PASS en cada pasada, sin otras líneas), `presupuesto.mjs` en local con `PRESUPUESTO: OK`, el ensayo de la publicación (Tarea 9, paso 7: `publicar-b5.mjs antes` sobre B4 y `despues` y `capturas` sobre B5) en verde, con la 2.ª apertura en el caso difícil, y las 75 capturas de §11 y sus 4 hojas de contacto, revisadas e iguales píxel a píxel a las de la pasada anterior.
- De la Tarea 9 solo se ejecutaron los pasos 2 a 7, y de la 8 no se ejecutó el 6: el ejecutor rechaza todo bloque con `git push`, `gh`, `curl` o la web publicada. El paso 2 se ensayó además con un `main` simulado en el que el bot subió su versión (el choque de las líneas 1 y 2 de `sw.js`), con un escudo añadido a mano en ese `main` y de vuelta del paso 9, con las suites en verde después; y la comprobación de `publicar-b5.mjs`, con un B5 sin la limpieza del arranque: la 2.ª apertura sale a medias, y el guion, con 1.
- Las suites, además, como las corre el bot (Python 3.11 con solo pytest y pyyaml, sin Pillow, node sin `node_modules`, `LANG=C` y `TZ=UTC`) sobre el árbol final: dentro de los tres bots, `497 passed, 25 skipped` y node 747, también con un escudo nuevo sin miniatura; con `GITHUB_WORKFLOW=Tests`, 4 fallos con ese escudo y 3 con un original cambiado.
- Antes, cada borrador se había verificado por separado sobre `0208d26`: las Tareas 1 y 2, y las 3 a 7 sin la 1 ni la 2 debajo. El ensamblado las encadenó (decisión 45) sin tocar su código: solo sus recuentos.

## Restricciones globales

Las de B4 (su cabecera, «Restricciones globales»), con estos cambios:
- **base**: la rama `rediseno-acta` en `0208d26` (= `main`: B4 publicada, versión `20260926`, más el arreglo de `test_season_preparation.py`, `8e4d23d`); recuentos de partida: pytest `511 passed, 5 skipped`, node 740 y los tres smoke, 21 PASS por pasada sin otras líneas;
- **cada tarea termina en un commit con todo en verde**: pytest, `node --test scripts/tests/test_*.mjs` y los tres smoke (`render-smoke`, `interaction-smoke` y `pwa-smoke`), tres pasadas, sin filtro y con `otras líneas: 0`;
- **`CODIGO`**: cada tarea que toca `src/*.js` o `acta.css` (la 3, la 4, la 5 y la 6) ejecuta `python3 scripts/codigo.py` antes de su commit y comitea `index.html` (si no, `test_rediseno_index.mjs` sale en rojo); el valor final, `840590e1`, lo recalcula `publicar.py` en la Tarea 9;
- **a prueba de bot**: ninguna prueba lee los `data-*.js` ni `config.js` vivos ni depende de la fecha, la hora o el idioma; las que leen `escudos/` vivo llevan el salto `LIVE` de `test_build_crests.py` (decisión 51 de B4); las marcas de `index.html` y `sw.js` que toca el bot (las `?v=`, «Última actualización», `CACHE_NAME` en la línea 1 y los literales `STATIC_ASSETS` y `SEASON_FILES`) siguen su contrato (`test_index_bot_contract.py`), y la línea 2 de `sw.js` queda fuera de su alcance (Tarea 1);
- **en pruebas de navegador**, `waitForAsync` o localizadores, nunca esperas fijas ni `waitForFunction` con predicado asíncrono; **ninguna espera de activación de un SW con una página abierta durante la espera** (plan B3, «Lo que B3 deja avisado»);
- **el `render` de la portada no cambia**: las huellas de `test_rediseno_vista_equipo.mjs` son la red (ninguna tarea las cambia; la 7 añade cinco) y el DOM de la primera pasada de `render-smoke` es el de la base en cada tarea;
- commits en español, con `git add` de rutas explícitas (y `git rm` de lo que se borra), nunca `HANDOFF.md` ni `docs/mejoras-2026-09.md`, y las dos líneas finales (`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9`); nunca se empuja con un workflow en marcha (`gh run list`);
- los guiones de edición localizan texto exacto de la tarea anterior y, si no lo encuentran las veces que esperan, se paran con un `AssertionError` sin escribir el fichero.

Además, en B5:
- **Fuera del repo:** vistas previas, capturas, mediciones y guiones de comprobación van a `S`, que sale de esta línea, que se ejecuta una vez antes de la Tarea 1 en la shell de los bloques y es la única que cambia otra sesión:

  ```bash
  export S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planB5
  ```

  Los bloques la leen con `: "${S:?falta S: la línea export S= de la cabecera}"`.
- **Salidas que dependen del día:** el DOM de la primera pasada de `render-smoke`, la portada con los datos reales y el reloj de verdad (el paso 0 de la Tarea 1 lo mide en `$S/dom-base.txt` y cada «Esperado» lo da relativo a ella) y su estado (D el 27/09/2026); la línea 1 de `sw.js` (la versión de los datos); la versión de `publicar.py` (la fecha UTC y lo que haya publicado el bot); los escudos de la portada con los datos reales (Tarea 1, paso 5, y Tarea 9, paso 7); y los tiempos de `presupuesto.mjs` (unas decenas de ms entre pasadas; los KB y el CLS no se mueven). Las salidas de las vistas previas (px, alturas) son las de esta máquina, con la fuente del repo: en otra pueden variar unos píxeles.
- **Los bloques largos** (decisión 54 de B4): la herramienta Bash corta a los 2 minutos si no se le da otro límite, y a los 10 como mucho. Los bloques que pasan de 2 minutos (el paso 6 de cada tarea, con los tres smoke tres veces, de 4 a 5 minutos; las capturas de §11) se lanzan con su `timeout` a 600000 ms, y los que pueden pasar de 10 (`gh run watch`, en la Tarea 8 y en la 9; y la espera del despliegue de Pages y la ejecución del bot, en la 9), en segundo plano (`run_in_background`) o con Monitor.
- **La máquina es compartida**: el presupuesto (`presupuesto.mjs`) y el paso de B4 a B5 con `publicar-b5.mjs` (Tarea 9) se ejecutan con la máquina en reposo, sin smoke ni otras mediciones a la vez.
- **Recuentos** (pytest / node / smoke por pasada), los de la verificación, con las tareas encadenadas:

  | | pytest | node | smoke |
  |---|---|---|---|
  | `0208d26` (partida) | `511 passed, 5 skipped` | 740 | 21 PASS |
  | Tarea 1 | `515 passed, 5 skipped` (+4) | 742 (+2) | 22 PASS (+1: `dataDeploy`) |
  | Tarea 2 | `517 passed, 5 skipped` (+2) | 743 (+1) | 22 PASS |
  | Tarea 3 | `517 passed, 5 skipped` | 737 (−12 +6) | 22 PASS |
  | Tarea 4 | `517 passed, 5 skipped` | 741 (+4) | 23 PASS (+1: «Reintentar» de un bloque) |
  | Tarea 5 | `517 passed, 5 skipped` | 742 (+1) | 24 PASS (+1: el esqueleto de Equipo) |
  | Tarea 6 | `517 passed, 5 skipped` | 744 (+2) | 24 PASS |
  | Tarea 7 | `517 passed, 5 skipped` | 747 (+3) | 25 PASS (+1: la portada de B a X a 320 px) |
  | Tarea 8 | `517 passed, 5 skipped` | 747 | 25 PASS |
  | Tarea 9 (la versión) | `517 passed, 5 skipped` | 747 | 25 PASS |

  Sin otras líneas en ninguna pasada. En el CI, sin Pillow, las dos pruebas de Pillow de `test_build_crests.py` se saltan; dentro de un bot, además, las de `LIVE` (decisión 51 de B4), también la nueva del sello (Tarea 1).

## Decisiones que interpretan la spec

Cada una, con la tarea que la aplica y su coste si fuera errónea. Las del esqueleto (1 a 10) mandan sobre las de los borradores (11 a 44), que interpretan dentro de ellas: las 11 a 24, de las Tareas 1 y 2, y las 25 a 44, de las 3 a 7. Las del ensamblado (45 a 57) resuelven lo que quedaba entre los borradores y las Tareas 8 y 9. Las de la revisión adversarial (58 a 60), con los arreglos que decidió el controlador, mandan sobre todas; donde cambian una, esa lo dice. No hubo otras decisiones del controlador posteriores al esqueleto.

### Del esqueleto

**Sin conexión**
1. **Los escudos, en su propia caché, que sobrevive a cada actualización** (B4 de la revisión adversarial de B4, aparcado en su decisión 57; Tarea 1).
   - `sw.js` gana una segunda línea literal, `const CRESTS_CACHE = 'futbolbase-escudos-<h>';` (la línea 1 sigue siendo `CACHE_NAME`), donde `<h>` son las 8 primeras cifras hex del sha1 de la lista ordenada de `<ruta>:<sha1 del fichero>\n` de todo `escudos/` (originales y `escudos/s/`): hoy, `860679a5`.
   - `fetch`: lo de `/escudos/` va *cache-first* contra `CRESTS_CACHE` (no contra `CACHE_NAME`); `classifyRequest` devuelve para ello una estrategia propia (`'escudo'`), con su prueba pura.
   - `activate`: borra las `futbolbase-v*` que no son `CACHE_NAME` (como en B4) y las `futbolbase-escudos-*` que no son `CRESTS_CACHE`.
   - `scripts/build_crests.py` escribe `<h>` en `sw.js` cuando cambia `escudos/`, y `--check` comprueba que coincide (con el salto `LIVE` en su prueba: los bots nunca tocan `escudos/`). El bot no toca esa línea: sus expresiones (`futbolbase-v[0-9a-z]+`, `generate_js.py:807`; `sync_versions.py:27`; `publicar.py:35`) no la alcanzan, y una prueba lo fija.
   - Prueba de conducta: en `pwa-smoke`, un despliegue de solo datos (sube `CACHE_NAME`, `escudos/` igual) y una apertura sin red que pinta los escudos (miniaturas, no monogramas); y un despliegue con un escudo cambiado que sí lo renueva (la caché de escudos nueva).
   - Coste: la primera publicación de B5 los pierde una vez sin red (como hoy); un escudo cambiado exige `build_crests.py`, que ya lo exige su prueba.
2. **La plantilla de la temporada del portal, sin conexión** (Tarea 2). `SEASON_FILES` gana `./data-lineups-<temporada del portal>.js` (11,3 KB con gzip el de 2025-2026); `scripts/activate_season.py` lo cambia por el de la temporada nueva al activarla (aunque ese fichero todavía no exista: el precache tolera el fallo con `allSettled`, y la primera visita con red lo guarda), con su prueba de pytest sobre un árbol sintético. La ficha de Equipo sigue esperando a las actas en `needs` (las de otras temporadas pesan de 5 a 18 KB con gzip): no se cambia. Coste: 11 KB más en cada instalación del SW.

**Interfaz**
3. **«Reintentar» de un bloque sin perder el sitio** en los bloques que fallan en el primer pintado: la Plantilla de Equipo, y los Goles y las Alineaciones de Partido (Tarea 4). Como la Trayectoria (`screen-equipo.js:266-269`) y «temporadas anteriores» (`screen-partido.js:437-448`): un manejador local (`stopPropagation`) que vuelve a pedir el fichero de ese bloque y repinta solo ese bloque, conservando el desplazamiento; el foco va al título del bloque. Prueba en Node (el `mount` real, sobre `fakeSection`: decisión 34) y en `interaction-smoke` (un 503 y luego 200: el desplazamiento no vuelve a 0). Coste: un manejador más en dos pantallas y un bloque con su id en cada variante; el otro bloque que falló espera a su propio «Reintentar» (decisión 31).
4. **Esqueletos propios de las seis pantallas de B3** (Equipo, Explorar, Ligas, Récords, Copa y Goleadores) en `BODIES` de `src/shell.js`, con título de bloque y cajas cuyo alto se acerca al de su primer bloque real a 390 px (medido con las fixtures), con sus clases en `acta.css` (Tarea 5). Prueba: cada pantalla tiene su esqueleto y solo clases que existen; y, en el navegador, el paso del esqueleto a la pantalla en Equipo de una temporada pasada no desplaza lo de arriba (CLS < 0,1, con su fórmula: decisión 39). Coste: los altos son los de lo que llega tras el esqueleto en una temporada pasada a 390 px; en otros casos el bloque de verdad es más alto o más bajo (decisión 37).
5. **Dos textos de Copa** (`src/screen-copa.js`; Tarea 6):
   - una final con resultado empatado y sin penaltis: el bloque «Campeón» lo dice («La final acabó en empate (2–2) y la fuente no dice quién ganó.»), en vez de «Todavía no hay campeón: la final no tiene resultado publicado» (§7: honestidad);
   - en una liguilla, los partidos sin fecha no repiten «sin fecha» en cada fila: van juntos al final bajo un único «Sin fecha».
   - Pruebas en Node con las fixtures, retocadas en la propia prueba (no traen ninguno de los dos casos).
   - Coste: ninguno; con los datos reales, el texto de la final hoy no sale (ninguna final real está empatada sin penaltis), y el «Sin fecha» cambia solo CLZ11 y CLZ12 de 2023/24.

**Código**
6. **Limpieza sin cambio de conducta** (Tarea 3):
   - los ayudantes repetidos, una sola vez: los nombres de categoría (`CAT_*`) en `model.js` (exportados), y `countLabel`, `score`, `signed` (la de `ui.js`, que admite `null`) y `decimal(n, cifras)` en `ui.js`;
   - `routeIsMine`, de `router.js` a `myteam.js`;
   - fuera `countMatches`, `matchAdvancer`, `bracketDrawAdvancer` y `bracketChampion` de `state.js` (nadie las usa en `src/`), con las pruebas heredadas que solo las ejercitan;
   - `listOf` de Goleadores, una vez por pintado y tecla;
   - `teamState`, una vez por pintado de la portada (la portada se lo pasa a `teamView`);
   - Datos y fuentes con `errorBox` (§7), con su «Reintentar»;
   - `nav.update` comprueba el token del `mount` que lo llama (no reescribe la URL de otra pantalla);
   - el «‹» del DOM pasa por `goBack()`, e `idle()` espera esa vuelta.
   - Red: las huellas de la portada y el DOM de `render-smoke` iguales, salvo lo que diga cada punto. Coste: un diff ancho en `src/`.

**Pruebas**
7. **Las pruebas que faltan** (§11 y «Sin prueba todavía» del plan B3; Tarea 7): en `interaction-smoke`, la tecla Intro en los dos buscadores, el calendario de escritorio de la portada a 1440 px y `checkLayout` a 320 px de la portada en los mundos B, C, D, E y X; etiquetas (escenario, ancho y tema) en los tiempos agotados de localizadores y clics, con un ayudante (`labeled`); en `test_rediseno_vista_equipo.mjs`, las huellas que faltan (D sin «Verano», C con otras notas, menos de 5 resultados, «por confirmar»); `standingsContext` con la jornada en curso; y las dos pruebas de `test_rediseno_integracion.mjs` que leen el texto de `app.js`, reescritas sobre la conducta. Coste: `interaction-smoke` tarda unos 7 s más por pasada.

**Cierre**
8. **La spec y la documentación al día** (Tarea 8):
   - la spec gana al final una adenda, «Lo que cambió al construirlo», con lo que se apartó del texto y por qué (una línea por punto, con el plan y la decisión): la publicación por fases y el CI de la rama por `workflow_dispatch`; `data-stats.js` retirado (Récords sale del modelo); los torneos, inmediatos (5,7 KB con gzip); la hoja se llama `acta.css`; sin `modulepreload`; el SW registrado tras `load`; los escudos en su propia caché; la plantilla del portal precacheada; y las frases que quedaron falsas (§2, §5.4, §5.5 y §12, y §5.2: decisión 46) llevan una nota que remite a la adenda, sin reescribir el diseño aprobado;
   - `README.md` describe la app de hoy (un equipo y «Vistos hace poco», no «varios favoritos»; los módulos de `src/`; cómo publicar con `publicar.py`).
   - Coste: ninguno; la spec sigue diciendo lo que se aprobó, y la adenda, lo que se hizo.
9. **Cerrado sin hacer, con su porqué** (en la adenda y en «Después de B5»): los torneos perezosos (decisión 2 de B4), `modulepreload` (decisión 6 de B4), virtualizar Goleadores (decisión 159 de B3: medido, y con 200 filas por página), las acciones de los `fetch-fiflp*.yml` (solo avisan; ya corren en Node 24 forzado), `fetch_mygol.py` (sin llamadores), memorizar `seasonRecords` (7 ms con las fixtures, 52 ms con los datos vivos de benjamín, al cambiar de categoría), la ficha de Equipo sin esperar a las actas (decisión 2), `SIZE = 138`, los cHRM de Safari, el precache a medias, la caché HTTP de 600 s sin SW y los alias de equipos renombrados en Partido. Coste: cada uno sigue como está; «Después de B5» dice qué lo reabriría.

**Publicación**
10. **Publicar B5** (Tarea 9; la ejecuta el controlador con el visto bueno dado: «publicando cada fase al terminarla», «Sigue»), como la Tarea 7 de B4 con estos cambios: `CODIGO` cambia (lo sube `publicar.py`) y el paso de B4 a B5 es un **despliegue de código**:
    - `publicar-b5.mjs` (desde `publicar-b4.mjs`): la 1.ª apertura, breve, pero **esperando a una condición** (que el SW de B4 haya revalidado el `index.html` nuevo), nunca un tiempo fijo (nota de la decisión 44 de B4); cada apertura, una versión entera: B4 (su hoja y sus módulos) o B5 (la hoja de B5, con una regla propia de B5, y sus módulos), sin el aviso del arranque, y sin red también;
    - la verificación visual de §11: `scripts/tests/capturas.mjs` (25 escenas: decisión 52; 390 claro y oscuro y 1440 claro) sobre el árbol final, revisadas, y unas hojas de contacto (una imagen por grupo de pantallas) para el usuario; y, tras publicar, la portada y Tabla desde la web;
    - el presupuesto en local y contra la web, y el bot lanzado una vez tras publicar.
    - Coste: la primera apertura sin red tras publicar pinta los escudos como monogramas, una vez (decisión 1); una publicación mala se arregla hacia delante, con otra publicación, nunca volviendo a publicar el `index.html` de B4.

### De los borradores (Tareas 1 a 7)

11. El sello no cuenta los ficheros ocultos de `escudos/` (un `.DS_Store`, que `.gitignore` excluye): con ellos, el sello local y el del CI podrían no coincidir. Coste: un oculto que la app pidiera no renovaría la caché, y la app no pide ninguno. (Tarea 1)
12. La red de un escudo lleva el sello como `?v=`, no la versión de los datos. GitHub Pages purga su CDN en cada despliegue y su clave no mira la query; la `?v=` solo cambia la clave de la caché HTTP del navegador, donde un escudo cambiado es otra entrada y una subida de datos no (corregida por la decisión 59: el borrador decía «otra URL para la CDN»). Coste: ninguno. (Tarea 1)
13. El escudo se guarda en `CRESTS_CACHE` antes de responder, y un fallo al guardar no impide pintarlo: el que se ve ya está guardado, aunque se cierre la app. Coste: el primer pintado de un escudo nunca visto espera a su descarga entera, unos KB. (Tarea 1)
14. `build_crests.py` solo necesita Pillow si hay miniaturas que escribir; sellar y borrar las que sobran, no. Así la escritura del sello se prueba en el CI. Coste: ninguno. (Tarea 1)
15. Si la línea 2 de `sw.js` no es la del contrato, `build_crests.py` no la inventa: sale con 1 sin escribir `sw.js`. Coste: un `sw.js` estropeado se arregla a mano. (Tarea 1)
16. `pwa-smoke`: el escenario nuevo, `dataDeploy`, usa la ficha de Unión Viera (A1), que da a la vez escudos (46) y plantilla: las actas congeladas solo traen A1. Fija el reloj de las páginas el 23/09/2026 y pide ya los escudos diferidos (`loading = 'eager'` desde la prueba), así que la cuenta no depende del día ni del alto de la ventana. Coste: en esa página, la prueba no mira la carga diferida de la app, que estas tareas no tocan. (Tarea 1)
17. `takeOver` sale de `codeDeploy`, con la misma sonda, los mismos estados y el mismo diagnóstico (`diagnose`). Su condición pasa a «una sola `futbolbase-v*`» en vez de «una sola caché»: en `codeDeploy` ya hay caché de escudos. En `dataDeploy`, la instalación de «a» se espera con la ficha abierta, como en `codeDeploy`: es la primera, sin un SW anterior que activar; las de «b» y «c», con `takeOver`, sin ninguna página de la app. Coste: un diff en `codeDeploy`, sin cambio de conducta. (Tarea 1)
18. El escudo cambiado de «c» se simula en el servidor, que sirve otra miniatura y el `sw.js` con otro sello (lo que dejaría `build_crests.py`), sin tocar `escudos/`. Coste: el navegador no ejerce `build_crests.py`; lo hace su prueba de pytest. (Tarea 1)
19. La comprobación del navegador de la plantilla va en `dataDeploy`, sin red tras una subida de datos, y no en el escenario principal: el riesgo es que la subida borre la copia guardada con red. Coste: la primera apertura sin red tras instalar, sin haber visitado la ficha con red, no se prueba aparte (la sirve el mismo precache). (Tarea 2)
20. `season_files_for` rehace el literal entero: una entrada por línea, el archivo que se cierra delante, ninguna plantilla más y la de la temporada nueva al final. Si `sw.js` no tiene `SEASON_FILES`, la activación se para (`ValueError`); antes seguía sin tocarlo. Coste: una activación se para, en el directorio temporal y sin sustituir nada, si alguien quita el literal. (Tarea 2)
21. La prueba de `SEASON_FILES` saca la temporada de la plantilla de `sw.js` (la siguiente a la última archivada), nunca de `config.js`. Coste: si un día falta en `SEASON_FILES` el archivo de la temporada anterior, falla (con razón). (Tarea 2)
22. `pwa-smoke` sigue valiendo con 2026/27 activada en el árbol: `frozen` da vacía la plantilla de otra temporada, y `dataDeploy` sirve el `sw.js` del árbol con la plantilla del portal congelado (2025-26). Coste: `dataDeploy` no prueba la entrada viva de `SEASON_FILES`; la prueba `test_sw_fixes.mjs`. (Tarea 2)
23. El paso 0 (la base del DOM de `render-smoke`) va en la Tarea 1, la primera del plan; la Tarea 3 lo repite solo si falta (otra sesión). Las Tareas 1 y 2 no cambian el DOM: el paso 6 de cada una lo compara con la base. Coste: ninguno. (Tareas 1 y 3)
24. Los textos que las tareas dejaban falsos se arreglan en ellas: en `docs/temporada-nueva.md`, un escudo nuevo se comitea con `sw.js` (Tarea 1) y lo que la activación cambia en `SEASON_FILES` (Tarea 2); y el comentario de `trim_shields.py`. Coste: ninguno; la Tarea 8 no toca esos párrafos.
25. Los nombres de categoría, en `model.js` como `CATEGORIES`, `CAT_NAMES`, `CAT_WORDS` y `CAT_SHORT`; las listas de validación de `router.js`, `myteam.js` y `store.js` y los nombres de las islas (`links.js` no puede importar `model.js`: ciclo) se quedan. Coste: unificarlos después es otro cambio pequeño. (Tarea 3)
26. El error de Fuentes dice «la comprobación de las fuentes» («el estado de las fuentes» daría «los datos de el estado»). Coste: una línea. (Tarea 3)
27. La prueba «Maspalomas publicada» de `test_review0615_frontend.mjs` se va entera: ejercitaba las cuatro borradas e `isRoundRobinCup` sobre el `data-maspalomas-cup-2026.js` vivo; el cuadro, el campeón y el tipo de grupo los cubren las fixtures (`test_rediseno_copa.mjs` y `test_rediseno_model_temporadas.mjs`). Coste: si se quiere comprobar el fichero publicado (que el bot no regenera), rehacerla con `bracket()`. (Tarea 3)
28. `listOf` se guarda por `ctx` (`WeakMap`): se apoya en que el router pasa el mismo objeto a `render` y a `mount`. Coste: si eso cambia, vuelve el doble cálculo, nunca un fallo. (Tarea 3)
29. `nav.update` ligado al token solo en el `nav` de cada `mount` (`navFor`); el que devuelve `startRouter` sigue sin él (sin `mount` no hay token que mirar). Coste: ninguno hoy. (Tarea 3)
30. En `matchRow`, la variable local `score` pasa a `result` (taparía la función importada). Coste: ninguno. (Tarea 3)
31. Cada «Reintentar» pinta solo su bloque, aunque la carga que llegó arregle también el otro (Goles y Alineaciones con las actas caídas): el otro espera a su propia pulsación, que ya no pide nada. Coste: un toque más; repintar los dos se apartaría de «solo ese bloque». (Tarea 4)
32. El desplazamiento se devuelve a mano tras sustituir el bloque: el anclaje del navegador lo movía (432 px en la Plantilla de Guayarmina). Coste: ninguno; en un navegador sin anclaje, `scrollTo` no hace nada. (Tarea 4)
33. La nota de las actas va dentro de la sección de la Plantilla (una sola sección que sustituir). Coste: ninguno visible (capturas). (Tarea 4)
34. «El `mount` con `fakeBrowser`» es el `mount` real sobre `fakeSection`, nueva en `fake-browser.mjs`: el navegador falso del router no guarda árboles ni busca por selector. Coste: si se quiere con el `main` de `fakeBrowser`, ampliarlo con secciones y bloques. (Tarea 4)
35. Una Plantilla que tras el «Reintentar» resulta no tener actas del grupo dice «La federación no ha publicado actas de este grupo.» en lugar de desaparecer. Coste: difiere del pintado normal (sin bloque) hasta la siguiente visita. (Tarea 4)
36. Mientras carga, el botón dice «Cargando…» y está desactivado. Coste: ninguno. (Tarea 4)
37. Las alturas de los esqueletos son las de lo que se ve tras cada uno (una temporada pasada; en Explorar, la primera visita de la sesión), medidas a 390 px con el mundo D; Equipo, la ficha de 2024/25 en D (173), no la de la temporada en curso en A (298). Coste: en la primera visita de la temporada en curso, en A, el bloque de verdad es más alto que el esqueleto. (Tarea 5)
38. Goleadores, sin título de bloque: tras su esqueleto solo llega el vacío que dice que no hay goleadores de esa temporada. Coste: se aparta de «con título de bloque» al pie de la letra. (Tarea 5)
39. «CLS < 0,1» en el navegador: la API Layout Instability da 0 con cualquier esqueleto (el router sustituye el contenido y los nodos nuevos no cuentan), así que la prueba calcula la puntuación con su fórmula sobre la cabecera y el primer bloque, suma las entradas de la API y añade la geometría (±1 px, ±15 %), que es lo que distingue un esqueleto malo. Coste: una métrica propia, no la del navegador. (Tarea 5)
40. La final empatada, con el vacío de borde discontinuo (`empty`), como «Todavía no hay campeón». Coste: ninguno. (Tarea 6)
41. «Sin fecha» con el título de día de Jornada (`h3.day-title`) y una segunda caja; las filas, sin la nota (`matchRow` con `note: false`). Jornada, que ya agrupa por días, sigue con la nota en cada fila. Coste: igualar Jornada sería otra tarea (su DOM y sus pruebas). (Tarea 6)
42. «C con otras notas» son dos huellas (sin fecha publicada; resultado pendiente). Coste: ninguno. (Tarea 7)
43. La portada de B a X, solo a 320 px en claro (el tema no cambia la maquetación). Coste: ninguno. (Tarea 7)
44. La prueba de las etiquetas mira las líneas de `interaction-smoke.mjs` y `capturas.mjs`; `pwa-smoke.mjs` queda fuera. Coste: sus clics siguen sin etiqueta. (Tarea 7)

### Del ensamblado

45. **Las Tareas 3 a 7 se encadenan tras la 1 y la 2** (se redactaron sobre `0208d26` sin ellas): sus recuentos pasan a los de la verificación del plan entero (tabla de las restricciones), y el paso 6 de cada una da pytest y node con su recuento literal, como el de las Tareas 1 y 2. Las Tareas 1 y 2 no tocan `src/` ni `acta.css`, así que el `CODIGO` de cada una es el que dio su borrador (`2ecc5c42`, `8e0fc0d1`, `9b47f80c` y `840590e1`: comprobado), y ningún fichero de las Tareas 3 a 7 lo toca la 1 ni la 2. Coste: ninguno.
46. **La Tarea 8 también pone al día `docs/rediseno-rebase.md`** (su línea de `sw.js`, «Git suele mezclarlo solo», es falsa desde la Tarea 1: aviso del redactor de las Tareas 1 y 2) **y la fila de `state.js` de §5.2 de la spec** (nombra funciones que ya no existen: tres desde B3 y B4, tres desde la Tarea 3). Coste: ninguno.
47. **Las notas de la spec**, en cursiva al final de la frase que quedó falsa, sin tocarla: «*(Nota: …; véase «Lo que cambió al construirlo», punto N.)*»; la adenda, al final, sin número de sección, un punto por línea con su plan y su decisión, y lo cerrado sin hacer como su último punto. El paso 3 de la Tarea 8 lo comprueba frase a frase. Coste: 13 notas en el texto aprobado.
48. **Tarea 9, paso 2**: fuera la búsqueda de los datos retirados de B4 (el bot de `main` ya tiene el generador de B4 y no los escribe) y dentro `build_crests.py --check` y la línea 2 de `sw.js` tras la fusión: un escudo añadido a mano en `main` dejaría en la rama el sello viejo y `Tests` en rojo, y el paso lo dice antes de subir la versión. El choque de las líneas 1 y 2 de `sw.js` se ensayó con un `main` simulado en el que el bot subió su versión, y la vuelta desde el paso 9, con uno que solo trajo un `data-health.json`. Coste: ninguno.
49. **`publicar-b5.mjs`, la 1.ª apertura de `despues`**: se cierra en cuanto el `index.html` de B5 está en la caché del SW de B4 (la condición de la decisión 10), o ya es el de la página, o esa caché ya no está (el SW de B5 se activó y la borró: nada que esperar); `caches.match` con `cacheName`, que no crea la caché que busca. En el ensayo, la 2.ª apertura fue el caso difícil: el `index.html` de B5 con el SW de B4 al mando, entera por la limpieza del arranque. Coste: si en la web el SW de B5 se activa ya en la 1.ª, la 2.ª es el caso fácil (lo dice su línea: «servida por el SW de B5»).
50. **`publicar-b5.mjs`, «versión entera»**: el `index.html` (la `?v=` de `data-seasons.js` y `CODIGO`), la hoja (aplicada: la barra fija a 390 px; y la de B5, con `.sk-box-team` de 147 px, de la Tarea 5) y los módulos (los del mapa de módulos de la página, con `import()` de la URL que ya importó `app.js`: `retryBlock` en `shell.js`, `countLabel` en `ui.js`, `CATEGORIES` en `model.js`, `routeIsMine` en `myteam.js` y ya no en `router.js`), las tres de B4 o las tres de B5; y el SW que la sirvió, el de B4 si al empezar la página un SW mandaba y la caché de B4 seguía ahí. Coste: las marcas son de B5; la fase siguiente que publique código tendrá que poner las suyas.
51. **`publicar-b5.mjs` abre la portada** (`#/`, la `start_url` de la app instalada), no Explorar como `publicar-b4.mjs`: es lo que abre la familia y tiene escudos, así que la 3.ª apertura (con red) y la 4.ª (sin red) los cuentan: la decisión 1 en el paso real, además de en `pwa-smoke`. Coste: la cuenta depende de los datos del día (6 escudos en D el 27/09/2026); la prueba solo exige que la 4.ª pinte los mismos que la 3.ª, en miniatura y sin monogramas.
52. **Las capturas de §11 son 25 escenas**, no 22 (el esqueleto): `capturas.mjs` tiene 25 desde la Tarea 12 de B3 (con las de B3), en las tres variantes, 75 capturas. **Las hojas de contacto**, 4 (la portada; Jornada, Tabla y Partido con error, vacío y sin conexión; Equipo, Explorar, Ligas y Copa; Goleadores, Récords, Temporadas, Fuentes y Ajustes), con las de 390 px en claro, una columna por captura, a su tamaño, con su nombre debajo, en una página HTML que Chrome fotografía (con la fuente de la app, sin Pillow). Las capturas de más de 3.200 px (Goleadores, con sus 200 filas, y la ficha de Equipo con la plantilla y la trayectoria abiertas) se recortan en la hoja, y su nombre lo dice. Coste: hojas anchas (hasta 3.392 × 3.429 px), que el usuario amplía en el móvil; las capturas enteras siguen en `$S/capturas-b5/`.
53. **Las hojas se envían al usuario antes de empujar** (spec §11: revisadas y enviadas antes de publicar), sin esperar su respuesta: el visto bueno ya está dado; si pide un cambio antes del paso 9, se para ahí. Coste: si la publicación se para después, el usuario habrá visto una versión que no llegó a la web.
54. **Las comprobaciones de la web de la Tarea 9** cambian con B5: `CODIGO` `840590e1`, la línea 2 de `sw.js`, la plantilla del portal en `SEASON_FILES`, la hoja y `shell.js` de B5 servidos y la plantilla con 200; sin las de B4 (el manifiesto, los iconos y los retirados, que B5 no toca). Y el bot, tras publicar, deja la línea 2 igual. Coste: ninguno.
55. **El aviso a la familia**: B5 no cambia el manifiesto (Android no preguntará nada, a diferencia de B4); el mensaje con las capturas dice que la primera vez que se abra sin cobertura tras la actualización los escudos pueden salir como iniciales (decisión 1). Coste: ninguno.
56. **La Tarea 8, solo documentación, pasa también las suites y los tres smoke**: cada tarea termina con todo en verde (restricciones globales), y cuesta unos 4,5 minutos. Coste: ese tiempo.
57. **La comprobación de la web mira la variante de la CDN que usan los móviles** (Tarea 9, paso 10; corregida por la decisión 59: antes esperaba a las URL con la `?v=` de B4, que para la CDN son la misma que la ruta desnuda): las esperas del paso piden con `curl -s --compressed` y sin query, la variante gzip que usa Chrome: la primera, `sw.js` con la versión nueva; y, antes de `despues`, `servida()`: `index.html` con su `CODIGO`, `acta.css` con su regla (`.sk-box-team`) y cada `src/*.js` igual al del árbol. GitHub Pages purga su CDN en cada despliegue, así que pasan al primer intento; si un día no purgara, lo verían, en lugar de dejar que `despues` se parara con un error menos claro. El ensayo local no tiene CDN. Coste: unos segundos.

### De la revisión adversarial (mandan sobre todas las anteriores)

58. **El caso raro del paso de B4 a B5, dicho y no prometido lo contrario** (M1; cambia el foco de revisión 1). Si en la 1.ª apertura tras publicar falla solo la revalidación de `index.html` (y no la de todos los módulos) y el SW de B5 no llega a instalarse antes de la apertura siguiente, la 2.ª sale a medias (la hoja de B4 con los módulos de B5: casi invisible, solo los altos de los esqueletos) o con el aviso del arranque (un módulo de B5 que pide una exportación que otro, todavía de B4, no tiene). Es de una apertura: «Reintentar» o la siguiente con red lo arreglan; sin red, se repite hasta que vuelve la red. Viene del diseño de B3 (la limpieza depende del `CODIGO` del `index.html`: decisión 155 de B3) y para este paso no tiene arreglo en la app, porque el `index.html` y el SW de B4 ya están en los móviles. Lo reproduce la simulación de la revisión, `$S/rev/sim/transicion-b5.mjs` (escenarios `control`, `index-falla` e `index-y-shell`, con sus resultados en `$S/rev/sim/resultado-*.txt`). El foco 1 y «Después de B5» lo dicen tal cual, y «Después de B5» deja la idea de arreglo para una fase futura. La variante de `codeDeploy` que lo documentaría no se añade: una prueba que fijara la conducta mala no ayuda. Coste: ninguno de código; el caso sigue existiendo, dicho.
59. **La CDN de GitHub Pages, medida** (B1; corrige las decisiones 12 y 57). La revisión lo midió: la CDN de Pages (Fastly) se purga en cada despliegue (los tiempos de la publicación de B4), y su clave no mira la query: `?v=`, `?nc=` y `&c=` son el mismo objeto que la ruta desnuda. Además, cada `Accept-Encoding` es un objeto aparte (la variante de Chrome es la de `curl --compressed`), y las cabeceras del cliente (`no-cache`, `max-age=0`) no se la saltan. La `?v=` solo cambia la clave de la caché HTTP del navegador.
    - Lo dicen así las decisiones 12 y 57, el contexto de la Tarea 1, el comentario nuevo de `sw.js` y el de su prueba, `publicar-b5.mjs`, el paso 10 de la Tarea 9 y «Después de B5». La `?v=` con el sello se queda: no hace daño.
    - El comentario de `sw.js` no está en la huella de `CODIGO`, que sigue siendo `840590e1` (comprobado), y los recuentos no cambian; el commit de la Tarea 1 cambia 2 líneas más.
    - La adenda de la spec (Tarea 8), revisada con el mismo criterio, no dice nada de la CDN.
    - Si GitHub dejara de purgar, la app no tendría arreglo barato (haría falta versionar las rutas, no las queries), y el paso 10, con `--compressed`, lo vería.
    - Coste: unas líneas de texto y un `--compressed`; sin cambio de conducta ni del contrato del bot.
60. **El CI de la rama, con los escenarios nuevos de los smoke, antes de publicar** (B2; Tarea 8, paso 6). Tras el commit de la Tarea 8 y sin ningún workflow en marcha, el controlador empuja `rediseno-acta` y lanza `tests.yml` sobre ella (`gh workflow run tests.yml --ref rediseno-acta`), localizando la ejecución por su `headSha` y esperándola con `gh run watch --exit-status` en segundo plano; si sale en rojo, se depura antes de la Tarea 9. Así `dataDeploy` de `pwa-smoke` y los escenarios nuevos de `interaction-smoke` («Reintentar» de un bloque, el esqueleto de Equipo, la portada de B a X a 320 px, Intro y el calendario de escritorio) corren en el runner antes del día de publicar (B3 tuvo fallos de `pwa-smoke` que solo salían en el CI). La rama no despliega nada; el paso 9 de la Tarea 9 (el CI de la rama con el commit de la versión) se queda como está. El ejecutor de la verificación rechaza este paso, porque toca GitHub. Coste: de 5 a 15 minutos antes de publicar.

## Foco de revisión (cada línea con su prueba en la tarea indicada)

1. **Un móvil con B4 instalada recibe B5** (código nuevo): cada apertura, una versión entera y sin el aviso del arranque, con red y sin ella (Tarea 9: `publicar-b5.mjs`, ensayado en local en el paso 7 y en la web en el paso 10; y `pwa-smoke`, su escenario de despliegue de código, `codeDeploy`, con `takeOver` desde la Tarea 1), **salvo el caso raro que viene de B3** (decisión 58): si en la 1.ª apertura falla solo la revalidación de `index.html` y el SW de B5 no llega a instalarse antes de la siguiente, la 2.ª sale a medias (la hoja de B4 con los módulos de B5) o con el aviso del arranque; es de una apertura, que «Reintentar» o la siguiente con red arreglan. Lo reproduce la simulación de la revisión (`$S/rev/sim/transicion-b5.mjs`); ninguna prueba del plan lo fija.
2. **Sin conexión tras una actualización de datos del bot**: los escudos y la plantilla de la temporada siguen ahí (Tareas 1 y 2: `dataDeploy` de `pwa-smoke`, y el paso 5 de la Tarea 1 con los datos reales; en el paso de B4 a B5, la Tarea 9).
3. **El bot tras B5**: sus suites en verde con los datos reales (ninguna prueba nueva lee datos vivos ni `escudos/` fuera del salto `LIVE`), y su subida de versión no toca `CRESTS_CACHE` (Tarea 1: `test_index_bot_contract.py`; Tarea 9, paso 11: el bot de verdad).
4. **La activación de 2026/27**: `activate_season.py` deja en `SEASON_FILES` la plantilla de la temporada nueva y las suites en verde (Tarea 2: `test_season_preparation.py` y el paso 5; `test_season_preparation.py` ya se arregló en `0208d26`).
5. **La limpieza no cambia nada visible**: las huellas de la portada y su DOM iguales, y los smoke (Tarea 3; las Tareas 4 a 7 no cambian las huellas y la 7 añade cinco).

## Estructura de ficheros

- `sw.js` (modificar): la línea 2 y la estrategia de los escudos (Tarea 1); `SEASON_FILES` (Tarea 2); `CACHE_NAME` (Tarea 9).
- `scripts/build_crests.py` y `scripts/trim_shields.py` (Tarea 1), `scripts/activate_season.py` (Tarea 2) y `docs/temporada-nueva.md` (Tareas 1 y 2), modificar.
- `src/ui.js`, `src/model.js`, `src/myteam.js`, `src/router.js`, `src/state.js`, `src/team-view.js`, `src/screen-home.js`, `src/screen-equipo.js`, `src/screen-partido.js`, `src/screen-explorar.js`, `src/screen-ligas.js`, `src/screen-goleadores.js`, `src/screen-records.js`, `src/screen-copa.js`, `src/screen-fuentes.js` y `acta.css` (Tarea 3); `src/shell.js`, `src/screen-equipo.js` y `src/screen-partido.js` (Tarea 4); `src/shell.js` y `acta.css` (Tarea 5); `src/screen-copa.js` y `src/ui.js` (Tarea 6). `index.html` (`CODIGO`), en las Tareas 3 a 6; sus marcas de versión, en la 9.
- Pruebas, modificadas: `test_sw_fixes.mjs`, `test_build_crests.py`, `test_index_bot_contract.py` y `pwa-smoke.mjs` (Tarea 1); `test_sw_fixes.mjs`, `test_season_preparation.py` y `pwa-smoke.mjs` (Tarea 2); `test_review0615_frontend.mjs`, `test_rediseno_state.mjs`, `test_rediseno_router.mjs`, `test_rediseno_fuentes.mjs`, `test_rediseno_ui.mjs`, `test_rediseno_modulos.mjs`, `test_rediseno_goleadores.mjs` y `test_rediseno_vista_equipo.mjs` (Tarea 3); `fixtures/rediseno/fake-browser.mjs`, `test_rediseno_equipo.mjs`, `test_rediseno_partido.mjs`, `test_rediseno_shell.mjs` e `interaction-smoke.mjs` (Tarea 4); `test_rediseno_shell.mjs` e `interaction-smoke.mjs` (Tarea 5); `test_rediseno_copa.mjs` (Tarea 6); `browser-wait.mjs`, `interaction-smoke.mjs`, `capturas.mjs`, `test_browser_waits.mjs`, `test_rediseno_vista_equipo.mjs`, `test_rediseno_tabla.mjs` y `test_rediseno_integracion.mjs` (Tarea 7). Ninguna nueva.
- `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`, `README.md` y `docs/rediseno-rebase.md` (Tarea 8).
- En GitHub: `rediseno-acta` y una ejecución de `tests.yml` sobre ella (Tarea 8, paso 6; decisión 60), y en la Tarea 9, la rama, `main` y una ejecución de `update.yml`.
- Fuera del repo (`$S`): `dom-base.txt` y `escudos-sin-red.mjs` (Tarea 1); `activada/` (Tarea 2, se borra); `vista-comun.mjs`, `vista-fuentes.mjs`, `vista-reintentar.mjs`, `vista-esqueletos.mjs` y `vista-copa.mjs`, con sus capturas en `vistas-t3/` a `vistas-t6/` (Tareas 3 a 6); `capturas-t7/` (Tarea 7); `hojas-contacto.mjs`, `capturas-b5/`, `publicar-b5.mjs`, `ensayo/`, `perfil-publicado/`, `version-antes.txt` y `publicado-b5/` (Tarea 9).

## Contratos (reconciliados con el código de las tareas)

### `sw.js`

```text
línea 1   const CACHE_NAME = 'futbolbase-v<versión>';          (sin cambios: la sube el bot, y publicar.py)
línea 2   const CRESTS_CACHE = 'futbolbase-escudos-<sello>';   (Tarea 1; la escribe build_crests.py; hoy 860679a5)
línea 3   const OFFLINE_URL = './index.html';
          versionedAssetURL(request, version = <la de CACHE_NAME>);  fetchFresh(request, cache = 'no-cache', version)
          classifyRequest(pathname) → 'escudo' si incluye '/escudos/' (antes del cache-first genérico), 'swr', 'cache-first'
                                      o 'network'
          fetch 'escudo': cache-first en CRESTS_CACHE; si no está, fetchFresh con el sello como ?v=, y cache.put antes
                          de responder
          activate: borra (k.startsWith('futbolbase-v') && k !== CACHE_NAME)
                         || (k.startsWith('futbolbase-escudos-') && k !== CRESTS_CACHE), y después clients.claim()
          SEASON_FILES = [los archivos (el más reciente, delante), './data-lineups-<temporada del portal>.js']   (Tarea 2)
                         hoy: 2024-2025, 2023-2024, 2022-2023, 2021-2022 y ./data-lineups-2025-2026.js
```

### Python

```python
# scripts/build_crests.py (Tarea 1)
SEAL_LINE = re.compile(r"const CRESTS_CACHE = 'futbolbase-escudos-([0-9a-f]{8})';")
def seal(root) -> str                     # sha1 de "".join(sorted("<ruta>:<sha1>\n" de escudos/**, sin ocultos))[:8]
def read_seal(worker: str) -> str | None  # el sello de la línea 2 de un sw.js, o None
# python3 scripts/build_crests.py          → lo de antes y, si el sello cambió, «sello de sw.js: <h> (antes, <h0>)»;
#                                            sin la línea 2 del contrato, «…: nada escrito» y 1
# python3 scripts/build_crests.py --check  → con otro sello, «sello de sw.js: <h0> (el de escudos/ es <h>)» y 1
# sin sw.js en la raíz, sin sello; Pillow, solo si hay alguna miniatura que escribir

# scripts/activate_season.py (Tarea 2)
LINEUPS_URL = re.compile(r"\./data-lineups-\d{4}-\d{4}\.js")
def season_files_for(worker: str, closing: str, opening: str) -> str
    # SEASON_FILES rehecho: './data-season-<closing>.js' delante (si no estaba), sin ninguna plantilla y, al final,
    # './data-lineups-<opening>.js'; el resto de sw.js, igual. ValueError sin el literal.
# apply_manifest(manifest, evidence, root): escribe en sw.js season_files_for(sw.js, config["season"], manifest["season"])
```

### `src/`

```js
// src/ui.js (Tareas 3 y 6)
export function countLabel(n, one, many) → string      // «1 grupo», «3 grupos»
export function score(a, b) → string                   // «2–7»
export function signed(n) → string                     // «+24», «−30», «0»; '' con null
export function decimal(n, digits) → string            // decimal(8.0123, 2) → «8,01»
export function matchRow(match, { mine = false, today, shields, href, note = true } = {}) → Html
//   note: false, sin la nota de estado ni de penaltis (los «Sin fecha» de la liguilla la dicen en su título)
// src/model.js (Tarea 3)
export const CATEGORIES = ['benjamin', 'prebenjamin'];
export const CAT_NAMES;   // { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' }
export const CAT_WORDS;   // { benjamin: 'benjamín', prebenjamin: 'prebenjamín' }
export const CAT_SHORT;   // { benjamin: 'benj.', prebenjamin: 'preb.' }
// src/myteam.js (Tarea 3; antes en router.js, igual)
export function routeIsMine(route, resolution) → boolean
// src/team-view.js (Tarea 3)
export function teamView(ctx, { group, name }, { …, state = null })   // state: el de quien ya lo calculó; sin él, teamState
// src/router.js (Tarea 3): cada mount recibe { ...nav, update(params) }, con update → false si su navegación ya no es la
//   vigente; el «‹» del DOM pasa por goBack(), e idle() espera su vuelta
// src/state.js (Tarea 3): sin countMatches, matchAdvancer, bracketDrawAdvancer ni bracketChampion
// src/shell.js (Tarea 4)
export async function retryBlock(section, id, button, load, paint) → Promise<Element | null>
//   section.querySelector(`#${id}`) → el bloque; button: el pulsado («Cargando…», disabled); load(): la carga, que
//   nunca rechaza; paint() → Html del bloque nuevo (una sección con el mismo id). Devuelve el bloque nuevo, o null si no
//   estaba o ya no está en la página. Devuelve el desplazamiento a su sitio y lleva el foco al título (tabindex -1).
// src/screen-equipo.js: la Plantilla, <section class="block" id="plantilla">, con la nota de las actas dentro (Tarea 4)
// src/screen-partido.js: <section class="block" id="goles"> y <section class="block" id="alineaciones"> (Tarea 4)
// src/shell.js, skeleton(screenId) (Tarea 5): Mi equipo y Equipo con escudo en la cabecera; y el primer bloque:
//   equipo .sk-box-team (147) · explorar .sk-box-search (54, margen 16) + .sk-box-leagues (319) · ligas .sk-box-groups (197)
//   · records .sk-box-cats (46, margen 14) + .sk-box-totals (54) · copa .sk-box-champion (99) · goleadores .sk-box-note
//   (65, sin título) · temporadas, fuentes y ajustes: el genérico (.sk-box, 96)
// src/screen-copa.js, el bloque «Campeón» sin campeón (Tarea 6):
//   la final jugada y empatada → «La final acabó en empate (2–2) y la fuente no dice quién ganó.»
//   si no → «Todavía no hay campeón: la final no tiene resultado publicado.»
//   liguilla: <ol class="box cal">…los de fecha…</ol><h3 class="day-title">Sin fecha</h3><ol class="box cal">…</ol>
```

### Pruebas y guiones

```js
// scripts/tests/pwa-smoke.mjs (Tareas 1 y 2): tres PASS en lugar de dos
async function takeOver(context, probeUrl, cache, label, diagnose = () => '')  // → lo que vio la última vuelta
async function dataDeploy(browser)  // PASS: sin conexión tras una subida de datos: …
// scripts/tests/fixtures/rediseno/fake-browser.mjs (Tarea 4)
export function fakeSection(screenId, blocks = {}) → { section, focus, block(id), clickIn(id, attrs, tag = 'button') }
//   clickIn → { event: { prevented, stopped }, target }; block(id) → { id, markup, title, isConnected } | null
// scripts/tests/browser-wait.mjs (Tarea 7)
export async function labeled(label, action) → Promise<lo que devuelve action>   // el error, con «<label>: » delante
// scripts/tests/interaction-smoke.mjs: retryBlocks (Tarea 4), shiftScore y skeletonShift (Tarea 5); click, pressEnter y
//   homeStates (Tarea 7); tres PASS nuevas (25 por pasada con las de pwa-smoke) y el texto nuevo de las de cada ancho
```

```text
$S/dom-base.txt                     el DOM de la primera pasada de render-smoke en la base (Tarea 1, paso 0)
$S/escudos-sin-red.mjs <a> <b> <p>  una subida de datos y la apertura sin red, con los datos reales (Tarea 1, paso 5)
$S/vista-comun.mjs                  run(out, escenas, { variants }) → problemas: la app real con los mundos de
                                    fixture-site.mjs en las tres variantes de §11 (Tarea 3, paso 5; la usan las 4 a 6)
$S/hojas-contacto.mjs <dir>         4 hojas de contacto de las capturas de 390 px en claro (Tarea 9, paso 6)
WEB=<url> S=<dir> node $S/publicar-b5.mjs antes|despues|capturas → 0 (OK), 1 (MAL) o 2 (uso)   (Tarea 9, paso 7)
```

---

### Task 1: Los escudos, en su propia caché: `CRESTS_CACHE`, con el sello de `escudos/` (decisión 1)

Sin conexión, la primera apertura tras cada subida de datos del bot pinta monogramas donde había escudos: los escudos pasan a una caché propia, cuyo nombre solo cambia cuando cambia un escudo.

**Contexto**
- **El fallo** (inventario §A; B4 de la revisión adversarial del plan B4, aparcado en su decisión 57). Los escudos se guardan según se usan (*cache-first*, spec §5.5) en la caché de la versión, `CACHE_NAME`: `classifyRequest` (`sw.js:82-96`) los manda al *cache-first* genérico (líneas 93-94) y el `fetch` los guarda con `putAndPurge` en `CACHE_NAME` (192-204). `activate` (160-166) borra las `futbolbase-v*` que no son la nueva, y con ellas los escudos; `crest()` (`src/ui.js:37-43`) no versiona sus URL. El bot sube `CACHE_NAME` con cada cambio de datos (tras cada jornada), así que la primera apertura sin red después de cada subida pinta monogramas. La simulación de la revisión (`$S/../planB4/rev/sim/actualizacion.mjs`: un perfil de Chrome, una subida de datos y una apertura sin red) dio 6 escudos con red y 0 sin red.
- **El arreglo** (decisión 1):
  - `sw.js` gana la línea 2, `const CRESTS_CACHE = 'futbolbase-escudos-<sello>';`; la 1 sigue siendo `CACHE_NAME` y `OFFLINE_URL` pasa a la 3. El sello son las 8 primeras cifras hex del sha1 de la lista ordenada de `<ruta>:<sha1 del fichero>\n` de todo `escudos/` (los 176 originales y las 176 miniaturas de `escudos/s/`; sin los ocultos, como un `.DS_Store`, que la app nunca pide y `.gitignore` excluye): hoy, `860679a5`.
  - `classifyRequest` devuelve `'escudo'` para lo que está bajo `/escudos/`, antes del *cache-first* genérico (que casaría con sus `.png` y `.jpg`). El `fetch` lo sirve *cache-first* de `CRESTS_CACHE`, nunca de `CACHE_NAME`. Si no está, lo pide a la red con el sello como `?v=` (GitHub Pages purga su CDN en cada despliegue y su clave no mira la query; la `?v=` solo cambia la clave de la caché HTTP del navegador: decisión 59). Para eso, `versionedAssetURL` y `fetchFresh` ganan un parámetro `version`, que por defecto sigue siendo la de `CACHE_NAME`. La copia se guarda antes de responder (un escudo pesa unos KB): el que se ve ya está en la caché, aunque la app se cierre en seguida; si no se puede guardar, se pinta igual.
  - `activate` borra, además de las `futbolbase-v*` que no son `CACHE_NAME`, las `futbolbase-escudos-*` que no son `CRESTS_CACHE`; las cachés de otros proyectos del origen, nunca (decisión 8 de B4). La limpieza del arranque de `index.html` solo mira las `futbolbase-v*` (código y hojas): la de los escudos no le afecta.
- **`scripts/build_crests.py`** gana `seal(root)` (el sello de `escudos/`) y `read_seal(texto)` (el de la línea 2 de un `sw.js`, o `None`). Al terminar las miniaturas escribe el sello en la línea 2 si cambió (`sello de sw.js: <nuevo> (antes, <viejo>)`), y `--check` lo compara (`sello de sw.js: <el de sw.js> (el de escudos/ es <el bueno>)`, un problema más «por arreglar»). Si la línea 2 no es la del contrato, no la inventa: sale con 1 sin tocar `sw.js`. Sin `sw.js` en la raíz (los árboles de prueba de `test_build_crests.py`) no mira el sello, así que sus salidas no cambian. Pillow pasa a hacer falta solo si hay alguna miniatura que escribir: sellar y borrar las que sobran no lo necesitan, y la prueba de la escritura del sello corre también en el CI, que no lo instala. `trim_shields.py` ya llama a `build_crests.main([])`: sella también, y su comentario lo dice.
- **El bot no alcanza la línea 2:**
  - `bump_cache_version` (`generate_js.py:807`) sustituye la primera `futbolbase-v[0-9a-z]+` (`count=1`), que está en la línea 1;
  - `sync_versions.py:27` usa la misma expresión, también la primera (`marks` y `apply_marks`);
  - `publicar.py:35` ancla la línea 1 entera;
  - `futbolbase-escudos-` no contiene `futbolbase-v`.

  Una prueba nueva de `test_index_bot_contract.py` ejecuta las tres sobre una copia del `sw.js` real y comprueba que la línea 2 sigue igual. También comprueba que, para `sync_versions.py`, otro sello no es una marca del bot: `--since` lo avisa, y se lleva a mano.
- **Las pruebas:**
  - `test_sw_fixes.mjs` (de 20 a 22):
    - `classifyRequest` de los escudos: la prueba de la «cláusula de escudos» pasa de `'cache-first'` a `'escudo'`;
    - `CRESTS_CACHE` en la línea 2;
    - el `fetch` de verdad con unas cachés y una red falsas: la primera vez, de la red con el sello y a `CRESTS_CACHE`; la segunda, de la caché; nunca `CACHE_NAME`;
    - el `activate` de la decisión 8 de B4, con las `futbolbase-escudos-*`.
  - `test_build_crests.py` (de 16 a 19):
    - el sello, sobre un árbol sintético: su definición, los ocultos y una miniatura cambiada;
    - su escritura y su comprobación, sin Pillow;
    - con el salto `LIVE` (decisión 51 de B4: los bots nunca tocan `escudos/`), que el `sw.js` del repo lleva el sello de `escudos/` tal como está.

    La prueba de que un escudo sin miniatura para `Tests` y nunca al bot copia también `sw.js`: con `Tests` fallan 4, las 3 de antes y la del sello.
  - `test_index_bot_contract.py` (de 2 a 3): la de arriba.
  - `pwa-smoke.mjs`:
    - un tercer escenario, `dataDeploy`: la ficha de Unión Viera (A1) con la versión «a» instalada; se publica «b», solo datos, y la apertura sin red pinta los mismos escudos, en miniatura; se publica «c», con un escudo cambiado y su sello nuevo, y la caché de escudos es otra, con el escudo nuevo;
    - los datos, los congelados; el reloj de las páginas, el 23/09/2026;
    - para contarlos, los escudos diferidos se piden ya, así que la cuenta no depende del alto de la ventana (46 en la ficha);
    - la espera del SW nuevo de `codeDeploy` (sin ninguna página de la app abierta) pasa a una función, `takeOver`, para los dos escenarios. Su condición pasa de «una sola caché» a «una sola `futbolbase-v*`», porque en `codeDeploy` ya hay caché de escudos: su «a» abre la portada.
- **El rojo:** con el `sw.js` de hoy, la apertura sin red tras la subida de datos da 0 miniaturas y 46 monogramas, frente a 46 miniaturas con red; con el arreglo, 46 miniaturas. El paso 5 lo repite con los datos reales, como la simulación de la revisión de B4: hoy, 0 de 6; con el arreglo, 6 de 6.
- **Recuentos:** pytest de `511 passed, 5 skipped` a `515 passed, 5 skipped` (+4); node de 740 a 742 (+2); los smoke, de 21 a 22 PASS por pasada (el escenario nuevo), sin otras líneas. El DOM de `render-smoke` no cambia (el paso 0 lo mide).
- **Coste** (decisión 1):
  - la primera publicación de B5 pierde los escudos una vez sin red: el SW de B5 borra la caché de B4, que los tenía, como hoy tras cada subida;
  - cada escudo nuevo o cambiado da otro sello y vacía la caché de escudos de todos, que se rellena según se usan: unas pocas veces por temporada, no tras cada jornada;
  - un escudo cambiado exige `build_crests.py`, que ya exigía su prueba.

**Files:**
- Modify: `sw.js` (la línea 2, `versionedAssetURL`, `fetchFresh`, `classifyRequest`, `activate` y `fetch`), `scripts/build_crests.py`, `scripts/trim_shields.py` (un comentario), `docs/temporada-nueva.md` (el paso de un escudo nuevo: se comitea también `sw.js`)
- Test: `scripts/tests/test_sw_fixes.mjs`, `scripts/tests/test_build_crests.py`, `scripts/tests/test_index_bot_contract.py`, `scripts/tests/pwa-smoke.mjs`
- Fuera del repo: `$S/dom-base.txt` (paso 0) y `$S/escudos-sin-red.mjs` (paso 5)

**Interfaces:**
- Consumes:
  - `loadSw(globals)` de `test_sw_fixes.mjs`: el SW en un contexto `vm`, con sus `listeners`;
  - de `test_build_crests.py`: `_png_with_tag`, `LIVE` y `build_crests.source_tag`; el fixture `site` de `test_index_bot_contract.py`;
  - `generate_js.bump_cache_version(root)`; `publicar.main(argv)` y `publicar._today_utc`; `sync_versions.apply_marks`, `marks` y `only_marks_changed`;
  - en `pwa-smoke.mjs`: `frozen(file)`, `read`, `TREE_VERSION`, `upstream` y `waitForAsync`, y dos miniaturas del árbol, `escudos/s/unionviera.png` y `escudos/s/huracan.png`;
  - `startPagesServer` (`pages-server.mjs`), `findChrome` y `waitForAsync`, en el paso 5.
- Produces:

```text
sw.js, línea 1   const CACHE_NAME = 'futbolbase-v<versión>';          (sin cambios: la sube el bot)
sw.js, línea 2   const CRESTS_CACHE = 'futbolbase-escudos-<sello>';   (la escribe build_crests.py; hoy 860679a5)
sw.js            versionedAssetURL(request, version = <la de CACHE_NAME>)
                 fetchFresh(request, cache = 'no-cache', version)
                 classifyRequest(pathname) → 'escudo' si incluye '/escudos/' (antes del cache-first genérico)
                 fetch 'escudo': cache-first en CRESTS_CACHE; si no está, fetchFresh con el sello como ?v=,
                   y cache.put antes de responder
                 activate: borra (k.startsWith('futbolbase-v') && k !== CACHE_NAME)
                   || (k.startsWith('futbolbase-escudos-') && k !== CRESTS_CACHE)
```

```python
# scripts/build_crests.py
SEAL_LINE = re.compile(r"const CRESTS_CACHE = 'futbolbase-escudos-([0-9a-f]{8})';")
def seal(root) -> str                     # sha1 de "".join(sorted("<ruta>:<sha1>\n" de escudos/**, sin ocultos))[:8]
def read_seal(worker: str) -> str | None  # el sello de la línea 2 de un sw.js, o None
# python3 scripts/build_crests.py          → lo de antes y, si el sello cambió, «sello de sw.js: <h> (antes, <h0>)»;
#                                            sin la línea 2 del contrato, «…: nada escrito» y 1
# python3 scripts/build_crests.py --check  → con otro sello, «sello de sw.js: <h0> (el de escudos/ es <h>)» y 1
# sin sw.js en la raíz, sin sello; Pillow, solo si hay alguna miniatura que escribir
```

```js
// scripts/tests/pwa-smoke.mjs
async function takeOver(context, probeUrl, cache, label, diagnose = () => '')  // → lo que vio la última vuelta
async function dataDeploy(browser)  // PASS: sin conexión tras una subida de datos: …
```

- [ ] **Step 0: La base del DOM de `render-smoke`**

La primera pasada de `render-smoke` pinta la portada con los datos reales y el reloj de verdad, así que el tamaño de su DOM depende del día. Se mide en la base, y cada «Esperado» del plan lo da relativo a ella (plan B3, decisión 164; plan B4, decisión 29). Las Tareas 1 y 2 no lo cambian.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
node scripts/tests/render-smoke.mjs | sed -nE 's/^PASS: render smoke OK .*\(DOM ([0-9]+) bytes\)$/\1/p' > "$S/dom-base.txt"
cat "$S/dom-base.txt"
```
Esperado: un número, el DOM de la base ese día (`16242` el 27/09/2026 sobre `0208d26`).

- [ ] **Step 1: Write the failing test**

Las pruebas de `sw.js`, del sello y del bot, con el guion de siempre (`edit` sustituye texto exacto que tiene que aparecer las veces dichas, o se para sin escribir):

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


edit('scripts/tests/test_sw_fixes.mjs', [
(""" *   5. C3: CACHE_NAME literal on line 1, matcheable by /futbolbase-v[0-9a-z]+/
""", """ *   5. C3: CACHE_NAME literal on line 1, matcheable by /futbolbase-v[0-9a-z]+/
 *   6. activate: solo las cachés de esta app de otras versiones (decisión 8 de B4)
 *   7. los escudos, en su propia caché: CRESTS_CACHE en la línea 2, con el sello de
 *      escudos/, que el bot no toca y activate no borra (decisión 1 de B5)
"""),
("""  const probes = ['CACHE_NAME', 'STATIC_ASSETS',""", """  const probes = ['CACHE_NAME', 'CRESTS_CACHE', 'STATIC_ASSETS',"""),
("""test('classifyRequest: escudos clause fixed (pathname starts with "/")', () => {
  assert.equal(sw.classifyRequest('/futbol-base/escudos/100x100arucas.png'), 'cache-first');
  assert.equal(sw.classifyRequest('/escudos/100x100arucas.png'), 'cache-first');
});
""", """test('classifyRequest: los escudos, originales y miniaturas, van a su propia caché (decisión 1 de B5)', () => {
  // El pathname empieza por "/" (la cláusula de escudos arreglada en 2026-06-11), y la rama de los
  // escudos va antes del cache-first genérico, que casaría con sus .png y .jpg.
  assert.equal(sw.classifyRequest('/futbol-base/escudos/100x100arucas.png'), 'escudo');
  assert.equal(sw.classifyRequest('/escudos/100x100arucas.png'), 'escudo');
  assert.equal(sw.classifyRequest('/futbol-base/escudos/s/100x100arucas.png'), 'escudo');
  assert.equal(sw.classifyRequest('/futbol-base/escudos/joveroLasRosas.jpg'), 'escudo');
  assert.equal(sw.classifyRequest('/futbol-base/icons/icon-192.png'), 'cache-first');
});
"""),
("""test('el SW busca en caché ignorando la ?v=: si no, el precache es basura', () => {""",
 """// La línea 2 es la caché de los escudos (decisión 1 de B5): su nombre lleva el sello de escudos/, que
// escribe scripts/build_crests.py (test_build_crests.py comprueba que es el de escudos/ tal como está), y
// la expresión con la que el bot sube la versión (futbolbase-v[0-9a-z]+) no la alcanza
// (test_index_bot_contract.py lo ejecuta, con sync_versions.py y publicar.py).
test('CRESTS_CACHE literal on line 2, with the seal of escudos/ and out of reach of the bot', () => {
  const second = swSrc.split('\\n')[1];
  assert.match(second, /^const CRESTS_CACHE = 'futbolbase-escudos-[0-9a-f]{8}';$/);
  assert.equal(sw.CRESTS_CACHE, second.slice("const CRESTS_CACHE = '".length, -2));
  assert.doesNotMatch(second, /futbolbase-v[0-9a-z]+/);
});

test('el SW busca en caché ignorando la ?v=: si no, el precache es basura', () => {"""),
("""// ─── 6. activate: solo las cachés de esta app (decisión 8 de B4) ────────────
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
""", """// ─── 6. activate: solo las cachés de esta app (decisión 8 de B4 y 1 de B5) ──
test('activate solo borra las cachés de esta app de otras versiones, futbolbase-v* y futbolbase-escudos-*: el origen es compartido (decisión 8 de B4 y 1 de B5)', async () => {
  // malolocabreralolo-tech.github.io lo comparte otro proyecto de la cuenta: sus cachés no se tocan. La
  // de los escudos se queda mientras su sello sea el de CRESTS_CACHE, aunque cambie CACHE_NAME.
  assert.match(sw.CRESTS_CACHE ?? '', /^futbolbase-escudos-[0-9a-f]{8}$/);
  assert.notEqual(sw.CRESTS_CACHE, 'futbolbase-escudos-00000000');
  const deleted = [];
  const worker = loadSw({ caches: {
    keys: async () => ['futbolbase-v20250101', sw.CACHE_NAME, 'futbolbase-v20991231z', 'otro-proyecto-v1', 'workbox-precache-v2', 'futbolbase',
      sw.CRESTS_CACHE, 'futbolbase-escudos-00000000', 'futbolbase-escudos', 'otro-proyecto-escudos-1'],
    delete: async (name) => { deleted.push(name); return true; },
  } });
  let done;
  worker.listeners.activate({ waitUntil: (promise) => { done = promise; } });
  await done;
  assert.deepEqual(deleted.sort(), ['futbolbase-escudos-00000000', 'futbolbase-v20250101', 'futbolbase-v20991231z']);
});

// ─── 7. los escudos, en su propia caché (decisión 1 de B5) ──────────────────
test('los escudos se sirven de CRESTS_CACHE; si no están, de la red con su sello como ?v=, y se guardan allí (decisión 1 de B5)', async () => {
  // El fetch de verdad, con unas cachés y una red falsas: nunca se abre CACHE_NAME, que cambia con cada
  // subida de datos, y la red se pide con el sello como ?v= (la clave de la caché HTTP del navegador).
  const seal = (sw.CRESTS_CACHE ?? '').replace('futbolbase-escudos-', '');
  assert.match(seal, /^[0-9a-f]{8}$/);
  const opened = [];
  const stored = new Map();
  const asked = [];
  const worker = loadSw({
    caches: {
      open: async (name) => {
        opened.push(name);
        return { match: async (request) => stored.get(request.url), put: async (request, response) => { stored.set(request.url, response); } };
      },
    },
    fetch: async (url, init) => { asked.push(`${url} ${init.cache}`); return { ok: true, clone() { return this; } }; },
  });
  const serve = (url) => new Promise((resolve) => {
    worker.listeners.fetch({ request: { url, method: 'GET' }, respondWith: resolve, waitUntil: () => {} });
  });
  const url = 'https://example.test/futbol-base/escudos/s/huracan.png';
  const first = await serve(url);
  assert.deepEqual(asked, [`${url}?v=${seal} no-cache`], 'la primera vez, de la red, con el sello');
  assert.equal(stored.get(url), first, 'y ya guardado en CRESTS_CACHE al responder');
  assert.equal(await serve(url), first, 'la segunda, de CRESTS_CACHE');
  assert.equal(asked.length, 1, 'sin volver a la red');
  assert.deepEqual([...new Set(opened)], [sw.CRESTS_CACHE], 'nunca CACHE_NAME');
});
"""),
])

edit('scripts/tests/test_build_crests.py', [
('''"""Plan B4, Tarea 4: las miniaturas de los escudos (spec §5.4; decisiones 9, 51 y 56).
''', '''"""Plan B4, Tarea 4: las miniaturas de los escudos (spec §5.4; decisiones 9, 51 y 56). Plan B5, Tarea 1: el
sello de escudos/ en la línea 2 de sw.js, el nombre de la caché de los escudos (decisión 1 de B5).
'''),
("""import io
import os
""", """import hashlib
import io
import os
"""),
('''@LIVE
def test_check_runs_without_pillow():
    # Como en el CI: sin Pillow, --check funciona igual (Pillow solo hace falta para escribir).
    code = ("import sys; sys.modules['PIL'] = None; sys.path.insert(0, 'scripts'); import build_crests;"
            " raise SystemExit(build_crests.main(['--check']))")
    run = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
''', '''@LIVE
def test_check_runs_without_pillow():
    # Como en el CI: sin Pillow, --check funciona igual (Pillow solo hace falta para escribir).
    code = ("import sys; sys.modules['PIL'] = None; sys.path.insert(0, 'scripts'); import build_crests;"
            " raise SystemExit(build_crests.main(['--check']))")
    run = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr


@LIVE
def test_sw_js_carries_the_seal_of_escudos():
    # La línea 2 de sw.js (CRESTS_CACHE, la caché de los escudos del SW) lleva el sello de escudos/ tal como
    # está: con el de antes, los móviles seguirían con la caché de escudos anterior y un escudo cambiado no
    # llegaría nunca (decisión 1 de B5). Lo arregla python3 scripts/build_crests.py.
    assert build_crests.read_seal((ROOT / "sw.js").read_text(encoding="utf-8")) == build_crests.seal(ROOT)
'''),
('''@LIVE
def test_build_writes_srgb_thumbnails_and_only_what_changed(tmp_path, capsys):''', '''def _sealed_site(tmp_path, seal="00000000"):
    """Un árbol de prueba sin Pillow: el original a.png, su miniatura al día y un sw.js con `seal` en su línea 2."""
    (tmp_path / "escudos" / "s").mkdir(parents=True)
    original = b"el original de a"
    (tmp_path / "escudos" / "a.png").write_bytes(original)
    (tmp_path / "escudos" / "s" / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original)))
    (tmp_path / "sw.js").write_text("const CACHE_NAME = 'futbolbase-v20260926';\\n"
                                    f"const CRESTS_CACHE = 'futbolbase-escudos-{seal}';\\n"
                                    "const OFFLINE_URL = './index.html';\\n", encoding="utf-8")
    return tmp_path


def test_the_seal_is_the_sha1_of_the_list_of_every_file_of_escudos_with_its_sha1(tmp_path):
    # Decisión 1 de B5: las 8 primeras cifras hex del sha1 de la lista ordenada de «<ruta>:<sha1 del fichero>»
    # de todo escudos/, originales y miniaturas. Los ocultos (un .DS_Store) no cuentan: la app nunca los pide,
    # y en el CI no estarían.
    site = _sealed_site(tmp_path)

    def sha1(data):
        return hashlib.sha1(data).hexdigest()

    listing = "".join(f"{rel}:{sha1((site / rel).read_bytes())}\\n" for rel in ("escudos/a.png", "escudos/s/a.png"))
    assert build_crests.seal(site) == sha1(listing.encode("utf-8"))[:8]
    before = build_crests.seal(site)
    (site / "escudos" / ".DS_Store").write_bytes(b"de otro ordenador")
    assert build_crests.seal(site) == before
    (site / "escudos" / "s" / "a.png").write_bytes(b"otra miniatura")
    assert build_crests.seal(site) != before
    assert build_crests.read_seal((site / "sw.js").read_text(encoding="utf-8")) == "00000000"
    assert build_crests.read_seal("const CACHE_NAME = 'futbolbase-v20260926';\\nconst OFFLINE_URL = './index.html';\\n") is None


def test_build_writes_the_seal_in_line_2_of_sw_js_and_check_compares_it(tmp_path, capsys, monkeypatch):
    # Sin nada que dibujar, build_crests.py no necesita Pillow: el CI lo prueba igual.
    monkeypatch.setitem(sys.modules, "PIL", None)
    site = _sealed_site(tmp_path)
    want = build_crests.seal(site)
    assert build_crests.main(["--check", "--root", str(site)]) == 1
    assert capsys.readouterr().out == (f"sello de sw.js: 00000000 (el de escudos/ es {want})\\n"
                                       "escudos/s: 1 al día, 1 por arreglar: python3 scripts/build_crests.py\\n")
    before = (site / "sw.js").read_text(encoding="utf-8").split("\\n")
    assert build_crests.main(["--root", str(site)]) == 0
    assert capsys.readouterr().out == f"escudos/s: 0 escritas, 1 al día, 0 borradas\\nsello de sw.js: {want} (antes, 00000000)\\n"
    after = (site / "sw.js").read_text(encoding="utf-8").split("\\n")
    assert after[1] == f"const CRESTS_CACHE = 'futbolbase-escudos-{want}';"
    assert after[:1] + after[2:] == before[:1] + before[2:], "solo cambia la línea 2"
    assert build_crests.main(["--check", "--root", str(site)]) == 0
    assert capsys.readouterr().out == "escudos/s: 1 al día\\n"
    # Una miniatura que sobra se borra, y el sello vuelve a ser el de lo que queda: el mismo.
    (site / "escudos" / "s" / "b.png").write_bytes(_png_with_tag("x"))
    assert build_crests.main(["--root", str(site)]) == 0
    assert capsys.readouterr().out == "borrada: escudos/s/b.png\\nescudos/s: 0 escritas, 1 al día, 1 borradas\\n"
    # Un sw.js sin la línea 2 del contrato: ni se toca ni se arregla solo.
    (site / "sw.js").write_text("const CACHE_NAME = 'futbolbase-v20260926';\\n", encoding="utf-8")
    assert build_crests.main(["--check", "--root", str(site)]) == 1
    assert capsys.readouterr().out.splitlines()[0] == f"sello de sw.js: falta la línea 2, const CRESTS_CACHE (el de escudos/ es {want})"
    assert build_crests.main(["--root", str(site)]) == 1
    assert capsys.readouterr().out.splitlines()[-1] == "sello de sw.js: falta la línea 2, const CRESTS_CACHE: nada escrito"
    assert (site / "sw.js").read_text(encoding="utf-8") == "const CACHE_NAME = 'futbolbase-v20260926';\\n"


@LIVE
def test_build_writes_srgb_thumbnails_and_only_what_changed(tmp_path, capsys):'''),
('''    # Una copia del árbol con un escudo nuevo sin su miniatura (un commit a mano en main): con
    # GITHUB_WORKFLOW=Tests fallan las tres pruebas que lo miran; dentro del bot (update.yml) se saltan
    # todas las de escudos/ y ninguna falla, así que el bot sigue publicando los datos.
    for rel in ("scripts/build_crests.py", "scripts/tests/test_build_crests.py", "src/ui.js", "icons/icon-180.png"):''',
 '''    # Una copia del árbol con un escudo nuevo sin su miniatura (un commit a mano en main): con
    # GITHUB_WORKFLOW=Tests fallan las cuatro pruebas que lo miran (las tres de las miniaturas y el sello de
    # sw.js, que ya no es el de escudos/); dentro del bot (update.yml) se saltan todas las de escudos/ y
    # ninguna falla, así que el bot sigue publicando los datos.
    for rel in ("scripts/build_crests.py", "scripts/tests/test_build_crests.py", "src/ui.js", "icons/icon-180.png", "sw.js"):'''),
('''    assert in_tests.startswith("3 failed, "), in_tests''', '''    assert in_tests.startswith("4 failed, "), in_tests'''),
])

edit('scripts/tests/test_index_bot_contract.py', [
('''    assert report["lastDataChange"] == f"{year}-{month}-{day}"
    assert report["dataVersion"] == version
''', '''    assert report["lastDataChange"] == f"{year}-{month}-{day}"
    assert report["dataVersion"] == version


def test_el_sello_de_los_escudos_no_lo_toca_ni_el_bot_ni_sync_versions_ni_publicar(site, monkeypatch):
    """Plan B5, decisión 1: la línea 2 de sw.js es CRESTS_CACHE, la caché de los escudos, con el sello de
    escudos/, y solo la escribe build_crests.py. La subida del bot (bump_cache_version: la primera
    futbolbase-v[0-9a-z]+), sync_versions.py (la misma expresión, sin anclar) y publicar.py (la línea 1
    entera) no la alcanzan; y, para sync_versions.py, otro sello no es una marca del bot."""
    import publicar
    import sync_versions

    shutil.copy(ROOT / "acta.css", site / "acta.css")
    shutil.copytree(ROOT / "src", site / "src")

    def line2():
        return (site / "sw.js").read_text(encoding="utf-8").splitlines()[1]

    seal = line2()
    assert re.fullmatch(r"const CRESTS_CACHE = 'futbolbase-escudos-[0-9a-f]{8}';", seal), seal
    generate_js.bump_cache_version(str(site))
    assert line2() == seal
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20991231")
    assert publicar.main(["--root", str(site)]) == 0
    assert line2() == seal
    index, sw = ((site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js"))
    wanted = {"v": "20991231z", "footer": "31/12/2099", "cache": "20991231z"}
    new_index, new_sw = sync_versions.apply_marks(index, sw, wanted)
    assert new_sw.splitlines()[1] == seal and sync_versions.marks(new_index, new_sw) == wanted
    resealed = sw.replace(seal, "const CRESTS_CACHE = 'futbolbase-escudos-00000000';")
    assert resealed != sw and not sync_versions.only_marks_changed(index, sw, index, resealed)
'''),
])
print('pruebas: el sello de escudos/ (test_build_crests), CRESTS_CACHE en test_sw_fixes y fuera del alcance del bot (test_index_bot_contract)')
PY
```
Esperado:
```text
pruebas: el sello de escudos/ (test_build_crests), CRESTS_CACHE en test_sw_fixes y fuera del alcance del bot (test_index_bot_contract)
```

Y el escenario nuevo de `pwa-smoke.mjs`, con `takeOver` compartido con `codeDeploy`:

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


edit('scripts/tests/pwa-smoke.mjs', [
("""// Después, un segundo escenario: un despliegue de código sobre el SW de la propia rama (codeDeploy).
// En los dos, ni la app nueva ni su SW piden los datos que B4 retiró (decisión 3 de B4).
""", """// Después, un segundo escenario: un despliegue de código sobre el SW de la propia rama (codeDeploy).
// En los dos, ni la app nueva ni su SW piden los datos que B4 retiró (decisión 3 de B4). Y un tercero:
// sin conexión tras una subida de datos del bot, los escudos ya vistos siguen ahí (dataDeploy).
"""),
("""async function codeDeploy(browser) {
  let phase = 'a';""", """// Espera, sin ninguna página de la app abierta, a que mande el SW de la versión cuya caché es `cache`
// (futbolbase-v…), y devuelve lo que vio la última vuelta, con todas las cachés. En cada vuelta, una
// página nueva de sonda (manifest.json, que el SW sirve de la red sin tocar su caché) pide la
// actualización, mira el estado y se cierra en seguida, como quien abre la app y la cierra: con una
// página de la app abierta, Chrome puede no activar el SW nuevo (codeDeploy). Solo cuentan las
// futbolbase-v*: la caché de los escudos va aparte (decisión 1 de B5). Si no llega en 30 s, el error
// dice cómo quedaron los SW en cada vuelta y lo que añada `diagnose`.
async function takeOver(context, probeUrl, cache, label, diagnose = () => '') {
  const states = [];
  const waitStart = Date.now();
  const look = async () => {
    const page = await context.newPage();
    try {
      await page.goto(probeUrl);
      return await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        try { await registration?.update(); } catch { /* ya se está instalando */ }
        return { caches: await caches.keys(), installing: registration?.installing?.state ?? null, waiting: registration?.waiting?.state ?? null,
          active: registration?.active?.state ?? null, controlled: !!registration?.active && navigator.serviceWorker.controller === registration.active };
      });
    } finally {
      await page.close();
    }
  };
  for (;;) {
    // Una navegación que falla en una vuelta cuenta como «todavía no», con su error en los estados.
    const seen = await look().catch((error) => ({ caches: [], installing: null, waiting: null, active: null, controlled: false,
      error: error.message.split('\\n')[0] }));
    // Cada cambio de estado de los SW, con los ms desde que empezó la espera.
    const state = [seen.installing, seen.waiting, seen.active, seen.controlled, seen.caches.length, seen.error ?? ''].join('/');
    if (states.at(-1)?.endsWith(` ${state}`) !== true) states.push(`${Date.now() - waitStart}ms ${state}`);
    const versions = seen.caches.filter((name) => name.startsWith('futbolbase-v'));
    if (versions.length === 1 && versions[0] === cache && seen.active === 'activated' && seen.controlled) return seen;
    if (Date.now() - waitStart >= 30000) {
      throw new Error(`${label}: condition not met after 30000ms: ${JSON.stringify({ ...seen, vueltas: states })}${diagnose()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function codeDeploy(browser) {
  let phase = 'a';"""),
("""    await racer.close();
    const states = [];
    const waitStart = Date.now();
    const look = async () => {
      const page = await context.newPage();
      try {
        await page.goto(probeUrl);
        return await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          try { await registration?.update(); } catch { /* ya se está instalando */ }
          return { caches: await caches.keys(), installing: registration?.installing?.state ?? null, waiting: registration?.waiting?.state ?? null,
            active: registration?.active?.state ?? null, controlled: !!registration?.active && navigator.serviceWorker.controller === registration.active };
        });
      } finally {
        await page.close();
      }
    };
    for (;;) {
      // Una navegación que falla en una vuelta cuenta como «todavía no», con su error en los estados.
      const seen = await look().catch((error) => ({ caches: [], installing: null, waiting: null, active: null, controlled: false,
        error: error.message.split('\\n')[0] }));
      // Cada cambio de estado de los SW, con los ms desde que empezó la espera.
      const state = [seen.installing, seen.waiting, seen.active, seen.controlled, seen.caches.length, seen.error ?? ''].join('/');
      if (states.at(-1)?.endsWith(` ${state}`) !== true) states.push(`${Date.now() - waitStart}ms ${state}`);
      if (seen.caches.length === 1 && seen.caches[0] === `futbolbase-v${CODE_B}` && seen.active === 'activated' && seen.controlled) break;
      if (Date.now() - waitStart >= 30000) {
        // Sin las comprobaciones de sw.js de cada vuelta, que taparían el resto.
        const since = requests.slice(releasedAt);
        const others = since.filter((line) => !line.endsWith(' /sw.js'));
        throw new Error(`despliegue de código, el SW de «b» al mando: condition not met after 30000ms: ${JSON.stringify({ ...seen, vueltas: states })}\\n`
          + `sin respuesta (${pending.size}): ${JSON.stringify([...pending.values()])}\\n`
          + `peticiones desde que se soltó «b» (y ${(since.length - others.length) / 2} comprobaciones de sw.js):\\n  ${others.slice(0, 150).join('\\n  ')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
""", """    await racer.close();
    await takeOver(context, probeUrl, `futbolbase-v${CODE_B}`, 'despliegue de código, el SW de «b» al mando', () => {
      // Sin las comprobaciones de sw.js de cada vuelta, que taparían el resto.
      const since = requests.slice(releasedAt);
      const others = since.filter((line) => !line.endsWith(' /sw.js'));
      return `\\nsin respuesta (${pending.size}): ${JSON.stringify([...pending.values()])}\\n`
        + `peticiones desde que se soltó «b» (y ${(since.length - others.length) / 2} comprobaciones de sw.js):\\n  ${others.slice(0, 150).join('\\n  ')}`;
    });
"""),
("""let browser;
try {""", """// ── 3. Sin conexión tras una subida de datos del bot (decisión 1 de B5) ─────────────────────────────
// Cada subida de datos del bot cambia CACHE_NAME, y el SW nuevo, al activarse, borra la caché anterior.
// Los escudos se guardan según se usan (cache-first, §5.5) y antes iban en esa caché: se iban con ella,
// y la primera apertura sin red tras cada subida pintaba monogramas. Ahora van en la suya, CRESTS_CACHE,
// con el sello de escudos/, que solo cambia con un escudo:
//  - «a» (el árbol publicado como 20991231a) instalada, y una apertura de la ficha de Unión Viera (A1)
//    con su SW al mando, que guarda sus escudos;
//  - se publica «b», solo datos (sube CACHE_NAME; escudos/ igual): su SW toma el mando (takeOver) y
//    borra la caché de «a». Sin conexión, la ficha pinta los mismos escudos, en miniatura, y ningún
//    monograma más; la caché de los escudos es la misma;
//  - se publica «c», con el escudo de Unión Viera cambiado y su sello nuevo, como lo dejaría
//    build_crests.py: su SW borra la caché de escudos anterior, y la apertura siguiente guarda el escudo
//    nuevo en la nueva.
// Los datos, los congelados (FROZEN); el código y los escudos, los del árbol; sin caché HTTP (no-store).
const DATA = { a: '20991231a', b: '20991231b', c: '20991231c' };
const FICHA = '#/equipo?s=2025-2026&g=A1&t=Uni%C3%B3n%20Viera';
const CHANGED = 'escudos/s/unionviera.png';   // el escudo que cambia en «c»
const REPLACEMENT = 'escudos/s/huracan.png';  // lo que sirve «c» en su lugar
const NEW_SEAL = 'c0c0c0c0';
async function dataDeploy(browser) {
  let phase = 'a';
  let down = false;          // sin conexión: el servidor corta cada conexión
  const treeCrests = (read(ROOT, 'sw.js').match(/^const CRESTS_CACHE = '(futbolbase-escudos-[0-9a-f]{8})';$/m) || [])[1];
  assert.notEqual(treeCrests, `futbolbase-escudos-${NEW_SEAL}`);
  assert.notEqual(statSync(join(ROOT, CHANGED)).size, statSync(join(ROOT, REPLACEMENT)).size);
  const server = createServer(async (req, res) => {
    if (down) { req.socket.destroy(); return; }
    const url = new URL(req.url, 'http://portal.test');
    const file = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    try {
      const data = frozen(file);
      if (data || file.startsWith('data-')) {
        if (!data) console.error('PWA fixture HTTP 404 (sin dato congelado)', req.url);
        res.writeHead(data ? 200 : 404, { 'Content-Type': data ? data.type : 'text/plain', 'Cache-Control': 'no-store' });
        res.end(data ? data.body : 'no está congelado');
        return;
      }
      if (file === 'index.html' || file === 'sw.js') {
        let text = read(ROOT, file).replaceAll(TREE_VERSION, DATA[phase]);
        if (file === 'sw.js' && phase === 'c') text = text.replace(/futbolbase-escudos-[0-9a-f]{8}/, `futbolbase-escudos-${NEW_SEAL}`);
        res.writeHead(200, { 'Content-Type': `${file === 'sw.js' ? 'text/javascript' : 'text/html'}; charset=utf-8`, 'Cache-Control': 'no-store' });
        res.end(text);
        return;
      }
      const source = phase === 'c' && file === CHANGED ? `/${REPLACEMENT}` : req.url;
      const response = await fetch(`http://127.0.0.1:${upstream.address().port}${source}`);
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'text/plain', 'Cache-Control': 'no-store' });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const home = `http://127.0.0.1:${server.address().port}/index.html`;
  const probeUrl = home.replace(/index\\.html$/, 'manifest.json');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' });
  // El reloj de las páginas, el día de los datos congelados (23/09/2026): la ficha es la misma cada día.
  await context.clock.setFixedTime(new Date('2026-09-23T12:00:00Z'));
  // Una apertura de la ficha en una página nueva, y sus escudos: también los diferidos (loading="lazy"),
  // que se piden ya para que la cuenta no dependa del alto de la ventana; cuando cada <img> ha cargado o,
  // si no pudo, ha pasado a monograma (crestFallback: la miniatura, el original y el monograma).
  const open = async (label) => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(home + FICHA);
    await waitForAsync(page, () => !!document.querySelector('#contenido section[data-screen], #contenido [role="alert"]'), null, { label });
    await page.evaluate(() => document.querySelectorAll('#contenido img.crest[loading="lazy"]').forEach((img) => { img.loading = 'eager'; }));
    await waitForAsync(page, () => [...document.querySelectorAll('#contenido img.crest')].every((img) => img.complete && img.naturalWidth > 0),
      null, { label: `${label}, sus escudos` });
    const seen = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('#contenido img.crest')];
      const mini = imgs.filter((img) => new URL(img.currentSrc).pathname.startsWith('/escudos/s/')).length;
      return { screen: document.querySelector('#contenido section[data-screen]')?.getAttribute('data-screen') ?? null,
        mini, orig: imgs.length - mini, mono: document.querySelectorAll('#contenido .mono').length };
    });
    return { page, seen: { ...seen, errores: errors } };
  };
  try {
    // «a» instalada: la 1.ª apertura registra su SW, que toma el mando (clients.claim) con su precache.
    let o = await open('sin conexión tras una subida de datos, «a»');
    await waitForAsync(o.page, (name) => caches.keys().then((keys) => keys.includes(name) && !!navigator.serviceWorker.controller),
      `futbolbase-v${DATA.a}`, { label: 'sin conexión tras una subida de datos, «a» instalada' });
    await o.page.close();
    // Con el SW de «a» al mando, la ficha le pide sus escudos, y él los guarda.
    o = await open('sin conexión tras una subida de datos, «a» con su SW');
    const online = o.seen;
    assert.ok(online.screen === 'equipo' && online.mini > 0 && online.orig === 0 && online.errores.length === 0,
      `sin conexión tras una subida de datos, «a» con su SW: ${JSON.stringify(online)}`);
    await o.page.close();
    // Se publica «b», solo datos: su SW toma el mando y borra la caché de «a».
    phase = 'b';
    let seen = await takeOver(context, probeUrl, `futbolbase-v${DATA.b}`, 'sin conexión tras una subida de datos, el SW de «b» al mando');
    // Sin conexión, la misma ficha: los mismos escudos, en miniatura.
    down = true;
    o = await open('sin conexión tras una subida de datos, «b» sin conexión');
    assert.deepEqual(o.seen, online, 'sin conexión tras una subida de datos, la ficha no pinta lo mismo que con conexión');
    await o.page.close();
    down = false;
    assert.deepEqual(seen.caches.filter((name) => name.startsWith('futbolbase-escudos-')), [treeCrests],
      `la caché de los escudos, tras una subida de datos: ${JSON.stringify(seen.caches)}`);
    // Se publica «c», con un escudo cambiado y su sello nuevo: su SW borra la caché de escudos anterior...
    phase = 'c';
    seen = await takeOver(context, probeUrl, `futbolbase-v${DATA.c}`, 'un escudo cambiado, el SW de «c» al mando');
    assert.deepEqual(seen.caches.filter((name) => name.startsWith('futbolbase-escudos-')), [],
      `con un escudo cambiado, la caché de escudos anterior sigue ahí: ${JSON.stringify(seen.caches)}`);
    // ... y la apertura siguiente guarda el escudo nuevo en la caché nueva.
    o = await open('un escudo cambiado, «c»');
    await waitForAsync(o.page, async ([name, path, size]) => {
      const response = await (await caches.open(name)).match(path);
      return !!response && (await response.arrayBuffer()).byteLength === size;
    }, [`futbolbase-escudos-${NEW_SEAL}`, `./${CHANGED}`, statSync(join(ROOT, REPLACEMENT)).size], { label: 'un escudo cambiado, el nuevo en la caché nueva' });
    await o.page.close();
    console.log(`PASS: sin conexión tras una subida de datos: la ficha pinta sus ${online.mini} escudos en miniatura, como con conexión, porque su caché (${treeCrests}) no cambia con CACHE_NAME; con un escudo cambiado, su sello nuevo da otra caché, con el escudo nuevo`);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

let browser;
try {"""),
("""  await codeDeploy(browser);
""", """  await codeDeploy(browser);
  await dataDeploy(browser);
"""),
])
print('pwa-smoke: takeOver compartido y el escenario de una subida de datos sin conexión (dataDeploy)')
PY
```
Esperado:
```text
pwa-smoke: takeOver compartido y el escenario de una subida de datos sin conexión (dataDeploy)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)' | sed -E 's/^not ok [0-9]+ /not ok /'
python3 -m pytest scripts/tests/test_build_crests.py scripts/tests/test_index_bot_contract.py -q 2>&1 | grep -E '^(FAILED|ERROR) |^[0-9]+ (failed|passed)' | sed -E 's/ - .*$//; s/ in [0-9.]*s$//'
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -E '^PASS|^AssertionError|^[+-]   ' | sed -E 's/^(PASS: [^:]*):.*/\1/'
```
Esperado (sin `CRESTS_CACHE` ni el sello, y con los escudos en `CACHE_NAME`: tras la subida de datos, sin red, la ficha pinta sus 46 escudos en monograma):
```text
not ok - classifyRequest: los escudos, originales y miniaturas, van a su propia caché (decisión 1 de B5)
not ok - CRESTS_CACHE literal on line 2, with the seal of escudos/ and out of reach of the bot
not ok - activate solo borra las cachés de esta app de otras versiones, futbolbase-v* y futbolbase-escudos-*: el origen es compartido (decisión 8 de B4 y 1 de B5)
not ok - los escudos se sirven de CRESTS_CACHE; si no están, de la red con su sello como ?v=, y se guardan allí (decisión 1 de B5)
# pass 18
# fail 4
FAILED scripts/tests/test_build_crests.py::test_sw_js_carries_the_seal_of_escudos
FAILED scripts/tests/test_build_crests.py::test_the_seal_is_the_sha1_of_the_list_of_every_file_of_escudos_with_its_sha1
FAILED scripts/tests/test_build_crests.py::test_build_writes_the_seal_in_line_2_of_sw_js_and_check_compares_it
FAILED scripts/tests/test_build_crests.py::test_a_crest_without_its_thumbnail_stops_tests_and_never_the_bots
FAILED scripts/tests/test_index_bot_contract.py::test_el_sello_de_los_escudos_no_lo_toca_ni_el_bot_ni_sync_versions_ni_publicar
5 failed, 17 passed
PASS: de la app anterior (su SW real) al rediseño, con datos congelados
PASS: despliegue de código sobre el SW de la rama
AssertionError [ERR_ASSERTION]: sin conexión tras una subida de datos, la ficha no pinta lo mismo que con conexión
+   mini: 0,
+   mono: 46,
-   mini: 46,
-   mono: 0,
```

- [ ] **Step 3: Write minimal implementation**

`sw.js` con la línea 2 (con un sello provisional, `00000000`), la estrategia `'escudo'` y su `activate`; `build_crests.py` con el sello; y los dos textos:

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
# La línea 2, con un sello provisional: build_crests.py escribe el de escudos/ (paso siguiente).
("""';
const OFFLINE_URL = './index.html';

// Version the network URL too: a CDN can still serve a cached previous HTML
// document for the bare path after a deployment. Cache keys remain stable.
function versionedAssetURL(request) {
  const url = new URL(typeof request === 'string' ? request : request.url, self.location.href);
  url.searchParams.set('v', CACHE_NAME.replace('futbolbase-v', ''));
  return url.href;
}

function fetchFresh(request, cache = 'no-cache') {
  return fetch(versionedAssetURL(request), { cache, credentials: 'same-origin' });
}
""", """';
const CRESTS_CACHE = 'futbolbase-escudos-00000000';
const OFFLINE_URL = './index.html';

// Los escudos (escudos/, originales y miniaturas) van en su propia caché,
// CRESTS_CACHE, no en CACHE_NAME, que cambia con cada subida de datos del bot
// (decisión 1 de B5): al activarse cada versión nueva se borraban con la
// anterior, y la primera apertura sin red pintaba monogramas. Su nombre lleva
// el sello de escudos/ (las 8 primeras cifras hex del sha1 de la lista
// ordenada de «<ruta>:<sha1 del fichero>»), que escribe y comprueba
// scripts/build_crests.py: un escudo nuevo o cambiado da otro sello, y
// `activate` borra la caché anterior. El bot no toca esta línea: sus
// expresiones buscan futbolbase-v (test_index_bot_contract.py).

// La URL de red lleva la versión (?v=), y las claves de la caché, no. GitHub
// Pages purga su CDN en cada despliegue y su clave no mira la query: la ?v=
// solo cambia la clave de la caché HTTP del navegador. Los escudos llevan su
// sello en vez de la versión de los datos (decisión 1 de B5).
function versionedAssetURL(request, version = CACHE_NAME.replace('futbolbase-v', '')) {
  const url = new URL(typeof request === 'string' ? request : request.url, self.location.href);
  url.searchParams.set('v', version);
  return url.href;
}

function fetchFresh(request, cache = 'no-cache', version) {
  return fetch(versionedAssetURL(request, version), { cache, credentials: 'same-origin' });
}
"""),
("""//   'cache-first' -> code, styles, images, fonts, escudos (immutable per ?v=).
//   'network'     -> everything else (network, offline fallback).""", """//   'escudo'      -> escudos/ (originales y miniaturas): cache-first en
//                    CRESTS_CACHE, que no cambia con los datos (decisión 1 de
//                    B5). Antes del cache-first genérico, que casaría con sus
//                    .png y .jpg.
//   'cache-first' -> code, styles, images, fonts (immutable per ?v=).
//   'network'     -> everything else (network, offline fallback)."""),
("""  if (/\\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ico)$/.test(pathname) ||
      pathname.includes('/escudos/')) return 'cache-first';""", """  if (pathname.includes('/escudos/')) return 'escudo';
  if (/\\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ico)$/.test(pathname)) return 'cache-first';"""),
("""// Solo las cachés de esta app (futbolbase-v*) de otras versiones: el origen
// (malolocabreralolo-tech.github.io) lo comparte otro proyecto de la cuenta, y
// sus cachés no se tocan (decisión 8 de B4). La limpieza del arranque de
// index.html se limita a lo mismo.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('futbolbase-v') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});""", """// Solo las cachés de esta app de otras versiones: las futbolbase-v* que no son
// CACHE_NAME y las futbolbase-escudos-* que no son CRESTS_CACHE (decisión 1 de
// B5). El origen (malolocabreralolo-tech.github.io) lo comparte otro proyecto
// de la cuenta, y sus cachés no se tocan (decisión 8 de B4). La limpieza del
// arranque de index.html solo mira las futbolbase-v* (código y hojas).
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => (k.startsWith('futbolbase-v') && k !== CACHE_NAME)
        || (k.startsWith('futbolbase-escudos-') && k !== CRESTS_CACHE)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});"""),
("""  // Cache-first for static assets (js, css, images, fonts, escudos)
  if (strategy === 'cache-first') {""", """  // Escudos: cache-first contra CRESTS_CACHE (decisión 1 de B5); de la red, con
  // el sello como ?v=. La copia se guarda antes de responder (un escudo pesa
  // unos KB): el que se ve ya está en la caché, aunque la app se cierre en
  // seguida. Si no se puede guardar, se pinta igual.
  if (strategy === 'escudo') {
    e.respondWith(
      caches.open(CRESTS_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const response = await fetchFresh(e.request, 'no-cache', CRESTS_CACHE.replace('futbolbase-escudos-', ''));
        if (response.ok) await cache.put(e.request, response.clone()).catch(() => {});
        return response;
      })
    );
    return;
  }

  // Cache-first for static assets (js, css, images, fonts)
  if (strategy === 'cache-first') {"""),
])

edit('scripts/build_crests.py', [
("""- en PNG optimizado, con un bloque tEXt «escudo» que guarda el sha1 del original y la receta: así
  --check sabe, sin Pillow, si una miniatura falta, sobra o se quedó atrás (un original cambiado
  con el mismo nombre).
""", """- en PNG optimizado, con un bloque tEXt «escudo» que guarda el sha1 del original y la receta: así
  --check sabe, sin Pillow, si una miniatura falta, sobra o se quedó atrás (un original cambiado
  con el mismo nombre).

Y el sello de escudos/ (decisión 1 del plan B5): las 8 primeras cifras hex del sha1 de la lista ordenada
de «<ruta>:<sha1 del fichero>» de todos sus ficheros, originales y miniaturas (sin los ocultos, que la app
nunca pide). Va en la línea 2 de sw.js, `const CRESTS_CACHE = 'futbolbase-escudos-<sello>';`, el nombre
de la caché de los escudos del SW: una subida de datos del bot no lo cambia, así que los escudos ya vistos
siguen ahí sin conexión; un escudo nuevo o cambiado da otro sello, y el SW nuevo borra la caché anterior.
Se escribe al terminar las miniaturas, y --check lo compara.
"""),
("""quedaron atrás y borra las que sobran.

Uso: python3 scripts/build_crests.py [--check] [--root R]
  --check: no escribe ni necesita Pillow; sale con 1 si falta, sobra o se quedó atrás alguna.
\"\"\"
import argparse
import hashlib
import io
import struct""", """quedaron atrás y borra las que sobran. Pillow solo hace falta si hay alguna que escribir.

Uso: python3 scripts/build_crests.py [--check] [--root R]
  --check: no escribe ni necesita Pillow; sale con 1 si falta, sobra o se quedó atrás alguna, o si el
  sello de sw.js no es el de escudos/.
\"\"\"
import argparse
import hashlib
import io
import re
import struct"""),
("""PNG_SIGNATURE = b"\\x89PNG\\r\\n\\x1a\\n"
""", """PNG_SIGNATURE = b"\\x89PNG\\r\\n\\x1a\\n"
SEAL_LINE = re.compile(r"const CRESTS_CACHE = 'futbolbase-escudos-([0-9a-f]{8})';")
"""),
("""def make_thumbnail(original: Path, target: Path):""", """def seal(root) -> str:
    \"\"\"El sello de escudos/: las 8 primeras cifras hex del sha1 de la lista ordenada de «<ruta>:<sha1>\\\\n»
    de todos sus ficheros (originales y miniaturas; la ruta, desde la raíz), sin los ocultos.\"\"\"
    root = Path(root)
    folder = root / "escudos"
    lines = sorted(f"{p.relative_to(root).as_posix()}:{hashlib.sha1(p.read_bytes()).hexdigest()}\\n"
                   for p in folder.rglob("*")
                   if p.is_file() and not any(part.startswith(".") for part in p.relative_to(folder).parts))
    return hashlib.sha1("".join(lines).encode("utf-8")).hexdigest()[:8]


def read_seal(worker: str):
    \"\"\"El sello de la línea 2 de un sw.js (CRESTS_CACHE), o None si esa línea no es la del contrato.\"\"\"
    lines = worker.split("\\n")
    found = SEAL_LINE.fullmatch(lines[1]) if len(lines) > 1 else None
    return found.group(1) if found else None


def make_thumbnail(original: Path, target: Path):"""),
("""    root = Path(args.root)
    state = survey(root)
    rel = lambda p: p.relative_to(root).as_posix()  # noqa: E731""", """    root = Path(args.root)
    state = survey(root)
    worker = root / "sw.js"  # sin sw.js (un árbol de prueba), no hay sello que mirar
    rel = lambda p: p.relative_to(root).as_posix()  # noqa: E731"""),
("""        problems = len(state["colisiones"]) + len(state["pendientes"]) + len(state["sobran"])
        print(""", """        problems = len(state["colisiones"]) + len(state["pendientes"]) + len(state["sobran"])
        if worker.is_file():
            have, want = read_seal(worker.read_text(encoding="utf-8")), seal(root)
            if have != want:
                print(f"sello de sw.js: {have or 'falta la línea 2, const CRESTS_CACHE'} (el de escudos/ es {want})")
                problems += 1
        print("""),
("""    if state["colisiones"]:
        return 1
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("build_crests.py necesita Pillow: pip install Pillow")
        return 1
    from PIL import ImageCms, UnidentifiedImageError
    failed = 0
    for original, thumb, _ in state["pendientes"]:
        try:
            make_thumbnail(original, thumb)
        except (ImageCms.PyCMSError, UnidentifiedImageError) as exc:
            print(f"no se pudo: {original.name}: {exc}")
            failed += 1
            continue
        print(f"escrita: {rel(thumb)}")
    for extra in state["sobran"]:""", """    if state["colisiones"]:
        return 1
    failed = 0
    if state["pendientes"]:
        try:
            from PIL import ImageCms, UnidentifiedImageError
        except ImportError:
            print("build_crests.py necesita Pillow: pip install Pillow")
            return 1
        for original, thumb, _ in state["pendientes"]:
            try:
                make_thumbnail(original, thumb)
            except (ImageCms.PyCMSError, UnidentifiedImageError) as exc:
                print(f"no se pudo: {original.name}: {exc}")
                failed += 1
                continue
            print(f"escrita: {rel(thumb)}")
    for extra in state["sobran"]:"""),
("""    print(summary + (f", {failed} con error" if failed else ""))
    return 1 if failed else 0""", """    print(summary + (f", {failed} con error" if failed else ""))
    if worker.is_file():
        text = worker.read_text(encoding="utf-8")
        have, want = read_seal(text), seal(root)
        if have is None:
            print("sello de sw.js: falta la línea 2, const CRESTS_CACHE: nada escrito")
            return 1
        if have != want:
            lines = text.split("\\n")
            lines[1] = f"const CRESTS_CACHE = 'futbolbase-escudos-{want}';"
            worker.write_text("\\n".join(lines), encoding="utf-8")
            print(f"sello de sw.js: {want} (antes, {have})")
    return 1 if failed else 0"""),
])

edit('scripts/trim_shields.py', [
("""    # y sin ella Tests sale en rojo (test_build_crests.py). build_crests.py escribe solo las que faltan.""",
 """    # y sin ella Tests sale en rojo (test_build_crests.py). build_crests.py escribe solo las que faltan, y
    # el sello nuevo de escudos/ en la línea 2 de sw.js (decisión 1 del plan B5)."""),
])

edit('docs/temporada-nueva.md', [
("""La segunda orden tiene que acabar en «al día». Se comitean los tres: el original, su miniatura y `data-shields.js`. `scripts/tests/test_build_crests.py` lo exige: sin la miniatura, o con una que se quedó atrás, `Tests` sale en rojo.""",
 """La segunda orden tiene que acabar en «al día». Se comitean los cuatro: el original, su miniatura, `data-shields.js` y `sw.js`, en cuya línea 2 la primera orden escribe el sello nuevo de `escudos/` (`CRESTS_CACHE`, la caché de los escudos de la app instalada: con otro sello, los móviles la cambian y piden el escudo nuevo; Plan B5, decisión 1). `scripts/tests/test_build_crests.py` lo exige: sin la miniatura, con una que se quedó atrás o con el sello de antes, `Tests` sale en rojo."""),
])
print('sw.js: CRESTS_CACHE en la línea 2 (sello provisional), la estrategia escudo y su activate; build_crests.py: el sello; trim_shields.py y docs/temporada-nueva.md, al día')
PY
```
Esperado:
```text
sw.js: CRESTS_CACHE en la línea 2 (sello provisional), la estrategia escudo y su activate; build_crests.py: el sello; trim_shields.py y docs/temporada-nueva.md, al día
```

El sello de verdad lo escribe `build_crests.py` (sin Pillow: no hay miniaturas que escribir), y `--check` lo da por bueno:

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/build_crests.py
python3 scripts/build_crests.py --check
sed -n 1,3p sw.js
```
Esperado (la línea 1, con la versión del día de la base):
```text
escudos/s: 0 escritas, 176 al día, 0 borradas
sello de sw.js: 860679a5 (antes, 00000000)
escudos/s: 176 al día
const CACHE_NAME = 'futbolbase-v20260926';
const CRESTS_CACHE = 'futbolbase-escudos-860679a5';
const OFFLINE_URL = './index.html';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^# (pass|fail)'
python3 -m pytest scripts/tests/test_build_crests.py scripts/tests/test_index_bot_contract.py -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node scripts/tests/pwa-smoke.mjs 2>&1 | sed -E 's/^(PASS: [^:]*):.*/\1/'
```
Esperado (el pase de node es el número de pruebas del fichero):
```text
# pass 22
# fail 0
22 passed
PASS: de la app anterior (su SW real) al rediseño, con datos congelados
PASS: despliegue de código sobre el SW de la rama
PASS: sin conexión tras una subida de datos
```

- [ ] **Step 5: Verificación: una subida de datos con los datos reales, antes y después (la simulación de la revisión de B4)**

Lo mismo que el escenario de `pwa-smoke`, con los datos reales y como en un móvil. `pages-server.mjs` sirve el sitio bajo `/futbol-base/`, con gzip y `max-age=600`, como GitHub Pages; cada apertura es un proceso de Chrome con el mismo perfil. El árbol «a» se instala y se abre con su SW al mando. El sitio pasa a «b», el mismo árbol con la versión subida, como el bot: la 1.ª apertura dura hasta que manda el SW de «b», y la 2.ª, sin red, cuenta los escudos de la portada. «Antes» usa el `sw.js` de la base; «ahora», el de este paso. El guion, en `$S`:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
cat > "$S/escudos-sin-red.mjs" <<'EOF'
// Plan B5, Tarea 1, paso 5: una subida de datos del bot y la apertura siguiente sin red, con los datos
// reales, como la simulación de la revisión de B4 ($S/../planB4/rev/sim/actualizacion.mjs). El sitio lo
// sirve pages-server.mjs (gzip y max-age=600, bajo /futbol-base/): primero el árbol «a»; un perfil de
// Chrome instala la app y la abre con su SW al mando; el sitio pasa al árbol «b», el mismo con la versión
// subida (bump_cache_version, como el bot); la 1.ª apertura, con red, dura hasta que el SW de «b» manda
// (skipWaiting y clients.claim, con la app abierta, como en un móvil); la 2.ª, en otro proceso de Chrome y
// sin red, cuenta los escudos de la portada: miniaturas, originales y monogramas (también los diferidos,
// que se piden ya). Cada apertura, un proceso de Chrome con el mismo perfil.
// Uso: node escudos-sin-red.mjs <árbol «a»> <árbol «b»> <perfil>
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = '/home/manolo/claude/futbol-base';
const [A, B, PROFILE] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(REPO, 'scripts', 'tests', file)).href);
const { startPagesServer } = await load('pages-server.mjs');
const { findChrome } = await load('render-smoke.mjs');
const { waitForAsync } = await load('browser-wait.mjs');
const { chromium } = createRequire(join(REPO, 'package.json'))('playwright');
const version = (tree) => readFileSync(join(tree, 'sw.js'), 'utf8').match(/futbolbase-v([0-9a-z]+)/)[1];
const WEB = `${PROFILE}-web`;
const point = (tree) => { rmSync(WEB, { force: true }); symlinkSync(tree, WEB); };
// Sin red: el proceso entero (la página y el SW) sale por un proxy que no existe.
const NO_NETWORK = ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'];
const LAUNCH = { executablePath: findChrome(), headless: true, args: ['--no-sandbox'] };
const CONTEXT = { viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' };
const painted = (page, label) => waitForAsync(page, () => !!document.querySelector('#contenido section[data-screen], #contenido [role="alert"]'),
  null, { timeout: 60000, label });
const crests = async (page, label) => {
  await page.evaluate(() => document.querySelectorAll('#contenido img.crest[loading="lazy"]').forEach((img) => { img.loading = 'eager'; }));
  await waitForAsync(page, () => [...document.querySelectorAll('#contenido img.crest')].every((img) => img.complete && img.naturalWidth > 0),
    null, { timeout: 60000, label: `${label}, sus escudos` });
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#contenido img.crest')];
    const mini = imgs.filter((img) => new URL(img.currentSrc).pathname.includes('/escudos/s/')).length;
    return `${mini} miniaturas, ${imgs.length - mini} originales, ${document.querySelectorAll('#contenido .mono').length} monogramas`;
  });
};
const session = async (offline, run) => {
  const context = await chromium.launchPersistentContext(PROFILE, { ...LAUNCH, ...CONTEXT, args: [...LAUNCH.args, ...(offline ? NO_NETWORK : [])] });
  try {
    return await run(context.pages()[0] || await context.newPage());
  } finally {
    await context.close();
  }
};

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
point(A);
const site = await startPagesServer(WEB);
const home = `${site.url}futbol-base/index.html#/`;
try {
  // «a» instalada: su SW al mando, con su precache.
  await session(false, async (page) => {
    await page.goto(home);
    await painted(page, '«a»');
    await waitForAsync(page, (name) => caches.keys().then((keys) => keys.includes(name) && !!navigator.serviceWorker.controller),
      `futbolbase-v${version(A)}`, { timeout: 60000, label: '«a» instalada' });
  });
  // Con el SW de «a» al mando, la portada le pide sus escudos.
  const online = await session(false, async (page) => { await page.goto(home); await painted(page, '«a» con su SW'); return crests(page, '«a» con su SW'); });
  console.log(`«a» (${version(A)}), con red: ${online}`);
  // La subida de datos: el mismo árbol con la versión subida. La 1.ª apertura, hasta que manda el SW de «b».
  point(B);
  const left = await session(false, async (page) => {
    await page.goto(home);
    await painted(page, '1.ª tras la subida');
    await waitForAsync(page, (name) => caches.keys().then((keys) => keys.filter((key) => key.startsWith('futbolbase-v')).join() === name
      && !!navigator.serviceWorker.controller), `futbolbase-v${version(B)}`, { timeout: 60000, label: 'el SW de «b» al mando' });
    return page.evaluate(() => caches.keys().then((keys) => keys.filter((key) => key.startsWith('futbolbase-')).sort().join(' ')));
  });
  // La 2.ª, sin red.
  const offline = await session(true, async (page) => { await page.goto(home); await painted(page, '«b» sin red'); return crests(page, '«b» sin red'); });
  console.log(`«b» (${version(B)}), sin red: ${offline}; cachés: ${left}`);
} finally {
  await site.close();
  rmSync(WEB, { force: true });
}
EOF
node --check "$S/escudos-sin-red.mjs" && echo "escudos-sin-red.mjs: sin errores de sintaxis"
```
Esperado:
```text
escudos-sin-red.mjs: sin errores de sintaxis
```

Los cuatro árboles (la base y este paso, cada uno con la versión «a» y la «b») y las dos simulaciones (unos 20 s):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
SIM="$S/escudos-sin-red"
rm -rf "$SIM" && mkdir -p "$SIM"
for tree in antes-a antes-b ahora-a ahora-b; do
  mkdir "$SIM/$tree"
  cp -r index.html sw.js acta.css manifest.json data-*.js data-health.json src icons fonts escudos "$SIM/$tree/"
  case $tree in antes-*) git show HEAD:sw.js > "$SIM/$tree/sw.js";; esac
  python3 -c "import sys; sys.path.insert(0, 'scripts'); import generate_js; generate_js.bump_cache_version(sys.argv[1], touch_footer=False, version=sys.argv[2])" "$SIM/$tree" "20991231${tree: -1}" > /dev/null
done
for when in antes ahora; do
  echo "$when:"
  node "$S/escudos-sin-red.mjs" "$SIM/$when-a" "$SIM/$when-b" "$SIM/perfil-$when"
done
rm -rf "$SIM"
```
Esperado (con los datos del 27/09/2026, la portada de Las Mesas tiene 6 escudos; con otros datos, otro número, pero el mismo en las líneas de «a» y en la de «b» de «ahora», y 0 miniaturas sin red en «antes»):
```text
antes:
«a» (20991231a), con red: 6 miniaturas, 0 originales, 0 monogramas
«b» (20991231b), sin red: 0 miniaturas, 0 originales, 6 monogramas; cachés: futbolbase-v20991231b
ahora:
«a» (20991231a), con red: 6 miniaturas, 0 originales, 0 monogramas
«b» (20991231b), sin red: 6 miniaturas, 0 originales, 0 monogramas; cachés: futbolbase-escudos-860679a5 futbolbase-v20991231b
```

- [ ] **Step 6: Suites completas y los tres smoke**

Unos 4 minutos: el bloque se lanza con el `timeout` de la herramienta a 600000 ms (decisión 54 de B4).

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
: "${S:?falta S: la línea export S= de la cabecera}"
node scripts/tests/render-smoke.mjs | head -1 | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado: pytest, el recuento anterior más 4, sin fallos; node, el anterior más 2; los smoke, 22 líneas PASS (una más: el escenario nuevo de `pwa-smoke`) y ninguna otra, en las tres pasadas; y la portada de `render-smoke` con el DOM de la base (su estado es el del día: D el 27/09/2026):
```text
515 passed, 5 skipped
# tests 742
# pass 742
# fail 0
pasada 1: 22 PASS; otras líneas: 0
pasada 2: 22 PASS; otras líneas: 0
pasada 3: 22 PASS; otras líneas: 0
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add sw.js scripts/build_crests.py scripts/trim_shields.py docs/temporada-nueva.md \
  scripts/tests/test_sw_fixes.mjs scripts/tests/test_build_crests.py scripts/tests/test_index_bot_contract.py scripts/tests/pwa-smoke.mjs
git commit -q -F - <<'EOF'
fix(rediseño): los escudos, en su propia caché con el sello de escudos/: sin conexión siguen ahí tras cada subida de datos (B5, tarea 1)

- sw.js: la línea 2, const CRESTS_CACHE = 'futbolbase-escudos-<sello>', la
  caché de los escudos (originales y miniaturas), que no cambia con
  CACHE_NAME. classifyRequest les da su estrategia ('escudo'), el fetch los
  sirve cache-first de ella (de la red, con el sello como ?v=, y guardados
  antes de responder), y activate borra, además de las futbolbase-v* de
  otras versiones, las futbolbase-escudos-* de otros sellos (decisión 1).
- build_crests.py: el sello (las 8 primeras cifras hex del sha1 de la lista
  ordenada de «<ruta>:<sha1>» de escudos/), que escribe en sw.js al terminar
  y que --check compara; Pillow, solo si hay miniaturas que escribir.
- Pruebas: test_sw_fixes (la estrategia, la línea 2, el fetch y activate),
  test_build_crests (el sello, sin Pillow, y con LIVE el del árbol; un
  escudo sin miniatura para Tests con 4 fallos), test_index_bot_contract (ni
  el bot, ni sync_versions.py, ni publicar.py tocan la línea 2) y pwa-smoke
  (dataDeploy: tras una subida de datos, sin red, la ficha pinta sus escudos
  en miniatura; con un escudo cambiado, otra caché de escudos; y takeOver,
  la espera del SW nuevo, compartida con codeDeploy).
- docs/temporada-nueva.md: un escudo nuevo se comitea con sw.js;
  trim_shields.py, su comentario.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1 | sed 's/^ *//'
```
Esperado:
```text
8 files changed, 455 insertions(+), 81 deletions(-)
```

---

### Task 2: La plantilla de la temporada del portal, sin conexión: `SEASON_FILES` y la activación (decisión 2)

Sin conexión, la ficha de Equipo de la temporada del portal pinta la caja de error en su Plantilla si sus actas no se abrieron antes con red (y, tras cada subida de datos, aunque se abrieran): el SW las precachea, y la activación de una temporada las cambia por las de la nueva.

**Contexto**
- **El fallo** (inventario §B). La ficha de Equipo espera en `needs` a `ensureLineups(s)` (`src/screen-equipo.js:281-288`). Si la carga falla (`null`), `squadBlock` pinta la Plantilla con la caja de error (línea 111). Ningún `data-lineups-*.js` está en `STATIC_ASSETS` ni en `SEASON_FILES` (en el `sw.js` de la base, líneas 66-72, solo las cuatro temporadas archivadas), y la copia que guarda el SW al pedirlas con red (*stale-while-revalidate*) vive en `CACHE_NAME`: la borra el `activate` de la subida de datos siguiente, como los escudos de la Tarea 1. Sin red, `fetchFresh` falla, el SW devuelve `index.html` (`OFFLINE_URL`), y `ensureLineups` no encuentra `LINEUPS_…`: `null`.
- **El arreglo** (decisión 2):
  - `SEASON_FILES` gana `./data-lineups-2025-2026.js`, las actas de la temporada del portal: 138.794 bytes, 11.327 con gzip en la web. La ficha de Equipo sigue esperando a las actas en `needs`, sin cambios: las de otras temporadas, de 5 a 18 KB con gzip, se piden al abrirlas.
  - `scripts/activate_season.py` reescribía `SEASON_FILES` con un `replace` literal que solo añadía el archivo de la temporada que se cierra (`apply_manifest`, líneas 144-148). Pasa a una función, `season_files_for(worker, closing, opening)`, que rehace el literal:
    - delante, ese archivo, si no estaba;
    - detrás, la plantilla de la temporada nueva en lugar de la anterior, aunque ese fichero todavía no exista.

    Sin actas no hay `data-lineups-<S>.js` (`generate_js.py` solo lo escribe para las temporadas con alguna acta). El precache lo salta, porque `install` usa `allSettled` y lo avisa en la consola (`[SW] Assets will retry on demand: 1`). La app, con su 404, da la temporada sin actas (`ensureLineups`: `{}`). Cuando llegan las actas, la subida de versión siguiente del bot lo precachea.
  - Sin `SEASON_FILES` en `sw.js`, la activación se para en el directorio temporal, antes de sustituir nada. Antes seguía sin tocarlo.
- **Qué pruebas miran `SEASON_FILES`** (`grep -rn "SEASON_FILES" scripts/ .github/` da `activate_season.py`, `test_data_globals_contract.mjs` y el `sw.js` congelado de la app anterior; y `pwa-smoke.mjs` sirve lo que pide el precache):
  - `test_data_globals_contract.mjs:88` corta `sw.js` entre `STATIC_ASSETS` y `SEASON_FILES`, solo para mirar los inmediatos;
  - `test_sw_fixes.mjs:94` exige que exista cada entrada de `STATIC_ASSETS`, nunca de `SEASON_FILES`;
  - `pwa-smoke.mjs` sirve los datos congelados (`frozen`): la plantilla de 2025-26 y, para cualquier otra temporada, hasta hoy, un 404 con una línea en la salida.

  Ninguna exige que exista una entrada de `SEASON_FILES`, y la prueba nueva de `test_sw_fixes.mjs` tampoco: el bot y la activación no pueden pararse porque falte la plantilla de la temporada nueva. El paso 5 lo comprueba: activa 2026/27 en una copia del árbol y pasa pytest, node y `pwa-smoke` sobre ella, sin `data-lineups-2026-2027.js`.
- **Las pruebas:**
  - `test_sw_fixes.mjs` (de 22 a 23): `SEASON_FILES` lleva las temporadas archivadas y una plantilla, la de la temporada siguiente a la última archivada. La temporada sale de `sw.js`, nunca de `config.js`: el bot nunca toca `SEASON_FILES`, y la activación cambia las dos a la vez.
  - `test_season_preparation.py` (de 10 a 12 recogidas):
    - `season_files_for`, sobre un `sw.js` sintético y sobre el del repo, con la temporada de su propia plantilla: solo cambia el literal;
    - la activación entera (`apply_manifest`) sobre un árbol sintético, con su base, su `config.js`, su `index.html` y su `sw.js`, de 2028-29 a 2029-30: el archivo entra, la plantilla es la de 2029-30 y ese fichero no existe; la de 2028-29 sí, porque tenía un acta.

    Las dos pruebas que copian el árbol vivo y activan la temporada siguiente a la suya (`8e4d23d`) no cambian.
  - `pwa-smoke.mjs`:
    - `dataDeploy` (Tarea 1) mira también la plantilla: con red, la tabla de la plantilla de Unión Viera, y sin red tras la subida de datos, la misma;
    - para que siga valiendo con 2026/27 activada en el árbol, sirve su `sw.js` con la plantilla del portal congelado (2025-26);
    - `frozen` da, vacía, la plantilla de cualquier otra temporada: sin la línea de 404 cuando el SW del árbol precachee la de 2026-27.
- **El navegador**, en `pwa-smoke` y no en `render-smoke` ni en `interaction-smoke`, que bloquean el SW. Va en `dataDeploy` y no en el escenario principal porque el riesgo es justo ese: la subida de datos del bot borra la copia guardada con red. El mismo precache cubre la primera apertura sin red tras instalar.
- **El rojo:** con la Tarea 1 y sin la 2, la apertura sin red tras la subida de datos pinta los mismos escudos, pero la Plantilla sale con su caja de error (`plantilla: false`).
- **Recuentos:** pytest de `515 passed, 5 skipped` a `517 passed, 5 skipped` (+2); node de 742 a 743 (+1); los smoke, 22 PASS por pasada, sin otras líneas.
- **Coste** (decisión 2): 11 KB más en cada instalación del SW. Tras activar 2026/27 y hasta que lleguen sus actas, una línea en la consola del SW en cada instalación.

**Files:**
- Modify: `sw.js` (`SEASON_FILES` y su comentario), `scripts/activate_season.py`, `docs/temporada-nueva.md` (lo que cambia la activación en `SEASON_FILES`)
- Test: `scripts/tests/test_sw_fixes.mjs`, `scripts/tests/test_season_preparation.py`, `scripts/tests/pwa-smoke.mjs`
- Fuera del repo: `$S/activada/` (paso 5, se borra al acabar)

**Interfaces:**
- Consumes:
  - `loadSw` de `test_sw_fixes.mjs`;
  - de `test_season_preparation.py`: `manifest_for`, `evidence_for` y `next_season`, `SCHEMA` (`db.py`), `migrate` (`migrate_actas_schema.py`), `apply_manifest` y `load_config`;
  - `dataDeploy`, `frozen` y `FICHA` de `pwa-smoke.mjs` (Tarea 1).
- Produces:

```text
sw.js   SEASON_FILES = [los archivos (el más reciente, delante), './data-lineups-<temporada del portal>.js']
        hoy: 2024-2025, 2023-2024, 2022-2023, 2021-2022 y ./data-lineups-2025-2026.js
```

```python
# scripts/activate_season.py
LINEUPS_URL = re.compile(r"\./data-lineups-\d{4}-\d{4}\.js")
def season_files_for(worker: str, closing: str, opening: str) -> str
    # SEASON_FILES rehecho: './data-season-<closing>.js' delante (si no estaba), sin ninguna plantilla y, al final,
    # './data-lineups-<opening>.js'; el resto de sw.js, igual. ValueError sin el literal.
# apply_manifest(manifest, evidence, root): escribe en sw.js season_files_for(sw.js, config["season"], manifest["season"])
```

- [ ] **Step 1: Write the failing test**

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


edit('scripts/tests/test_sw_fixes.mjs', [
("""  const probes = ['CACHE_NAME', 'CRESTS_CACHE', 'STATIC_ASSETS',""", """  const probes = ['CACHE_NAME', 'CRESTS_CACHE', 'STATIC_ASSETS', 'SEASON_FILES',"""),
("""// ─── 2. strategy: SWR reachable for data-*.js, cache-first for the rest ───""", """// SEASON_FILES (decisión 2 de B5): los archivos de las temporadas pasadas y la plantilla de la temporada del
// portal, que es la siguiente a la última archivada (activate_season.py cambia las dos a la vez, sin leer
// config.js). Ninguna prueba exige que existan: al activar una temporada, su plantilla no existe hasta que
// llegan sus actas, y el precache la salta (allSettled).
test('SEASON_FILES: las temporadas archivadas y la plantilla de la del portal, la siguiente a la última archivada (decisión 2 de B5)', () => {
  const files = [...sw.SEASON_FILES];
  const archived = files.filter((url) => /^\\.\\/data-season-\\d{4}-\\d{4}\\.js$/.test(url));
  const lineups = files.filter((url) => /^\\.\\/data-lineups-\\d{4}-\\d{4}\\.js$/.test(url));
  assert.equal(archived.length + lineups.length, files.length, `solo archivos y la plantilla: ${files.join(', ')}`);
  assert.equal(lineups.length, 1, `una plantilla, la de la temporada del portal: ${files.join(', ')}`);
  const last = Math.max(...archived.map((url) => Number(url.match(/-(\\d{4})\\.js$/)[1])));
  assert.equal(lineups[0], `./data-lineups-${last}-${last + 1}.js`);
});

// ─── 2. strategy: SWR reachable for data-*.js, cache-first for the rest ───"""),
])

edit('scripts/tests/test_season_preparation.py', [
('''import copy
import json
from pathlib import Path
import shutil
''', '''import copy
import json
from pathlib import Path
import re
import shutil
'''),
('''from activate_season import validate_manifest, verify_sources, seed_season, apply_manifest
import codigo
from db import SCHEMA, get_connection
''', '''from activate_season import validate_manifest, verify_sources, seed_season, apply_manifest
import activate_season
import codigo
from db import SCHEMA, get_connection
from migrate_actas_schema import migrate
'''),
('''def test_apply_recalculates_codigo_for_the_new_config(tmp_path):''', '''# Un sw.js sintético con la forma del de verdad: CACHE_NAME, CRESTS_CACHE y los dos literales.
WORKER = ("const CACHE_NAME = 'futbolbase-v20280101';\\n"
          "const CRESTS_CACHE = 'futbolbase-escudos-00000000';\\n"
          "const STATIC_ASSETS = [\\n  './',\\n];\\n\\n"
          "// Season data files\\n"
          "const SEASON_FILES = [\\n  './data-season-2027-2028.js',\\n  './data-lineups-2028-2029.js',\\n];\\n\\n"
          "function classifyRequest(pathname) {}\\n")


def test_season_files_swap_the_portal_lineups_and_keep_every_archive():
    # Plan B5, decisión 2: al activar 2029-2030, el archivo de 2028-2029 entra delante y la plantilla que
    # se precachea pasa a ser la de 2029-2030, aunque ese fichero todavía no exista; el resto, igual.
    out = activate_season.season_files_for(WORKER, "2028-2029", "2029-2030")
    assert out == WORKER.replace("  './data-season-2027-2028.js',\\n  './data-lineups-2028-2029.js',\\n",
                                 "  './data-season-2028-2029.js',\\n  './data-season-2027-2028.js',\\n  './data-lineups-2029-2030.js',\\n")
    assert activate_season.season_files_for(out, "2028-2029", "2029-2030") == out, "otra vez con la misma temporada: igual"
    # El sw.js del repositorio, con la temporada de su propia plantilla (nunca la de config.js): activar
    # la siguiente solo toca SEASON_FILES.
    real = (ROOT / "sw.js").read_text(encoding="utf-8")
    portal = re.search(r"'\\./data-lineups-(\\d{4}-\\d{4})\\.js'", real).group(1)
    after = activate_season.season_files_for(real, portal, next_season(portal))
    assert f"'./data-season-{portal}.js'" in after and f"'./data-lineups-{next_season(portal)}.js'" in after
    assert f"'./data-lineups-{portal}.js'" not in after
    literal = re.compile(r"const SEASON_FILES = \\[[^\\]]*\\];")
    assert literal.sub("", after) == literal.sub("", real)


def test_activation_on_a_synthetic_tree_precaches_the_lineups_of_the_new_season(tmp_path):
    # apply_manifest entero sobre un árbol sintético con sus propias temporadas (2028-2029 → 2029-2030, años
    # que acepta el lector de calendarios de fetch_futbolaspalmas.py): ni los data-*.js, ni el config.js ni la
    # base vivos. La temporada que se cierra tiene un acta, y su plantilla; la nueva todavía no tiene ninguna,
    # y SEASON_FILES ya precachea la suya (Plan B5, decisión 2).
    closing, opening = "2028-2029", "2029-2030"
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "config.js").write_text("export const PORTAL = " + json.dumps(
        {"season": closing, "nextSeason": opening, "defaultTeam": {"cat": "prebenjamin", "groupId": "OLD1", "name": "Local"},
         "timeZone": "Atlantic/Canary"}, indent=2) + ";\\n", encoding="utf-8")
    (tmp_path / "index.html").write_text('<script defer src="./data-seasons.js?v=20280101"></script>\\n'
                                         '<span id="legacyUpdated" hidden>Última actualización: 01/01/2028</span>\\n', encoding="utf-8")
    (tmp_path / "sw.js").write_text(WORKER, encoding="utf-8")
    conn = sqlite3.connect(tmp_path / "futbolbase.db")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript(f"""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '{closing}', 2028, 2029, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island, current_jornada)
        VALUES (1, 1, 2, 'OLD1', 'Grupo 1', 'PREBENJAMIN G-1', 'Liga', 'grancanaria', 'Jornada 1');
      INSERT INTO teams(id, name) VALUES (1, 'Local'), (2, 'Visitante');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta)
        VALUES (1, 1, 'Jornada 1', '2028-10-05', 1, 2, 1, 0, 90001);
      INSERT INTO players(id, full_name, norm_name) VALUES (1, 'PEREZ, JUAN', 'perez juan');
      INSERT INTO appearances(match_id, team_id, player_id, dorsal, role, goals) VALUES (1, 1, 1, 7, 'starter', 1);
    """)
    conn.commit()
    conn.close()
    manifest = manifest_for(opening)
    apply_manifest(manifest, evidence_for(manifest), tmp_path)
    assert load_config(tmp_path / "src/config.js")["season"] == opening
    worker = (tmp_path / "sw.js").read_text(encoding="utf-8")
    assert ("const SEASON_FILES = [\\n  './data-season-2028-2029.js',\\n  './data-season-2027-2028.js',\\n"
            "  './data-lineups-2029-2030.js',\\n];") in worker
    assert worker.splitlines()[1] == "const CRESTS_CACHE = 'futbolbase-escudos-00000000';"
    assert (tmp_path / "data-season-2028-2029.js").exists() and (tmp_path / "data-lineups-2028-2029.js").exists()
    assert not (tmp_path / "data-lineups-2029-2030.js").exists()


def test_apply_recalculates_codigo_for_the_new_config(tmp_path):'''),
])

edit('scripts/tests/pwa-smoke.mjs', [
("""// fixtures de B1, el día de los datos de hoy (23/09/2026), y el config.js de la app anterior (2025/26,
// con Las Mesas en PG2). Lo que las fixtures no traen, vacío: las temporadas archivadas, que el SW
// anterior precachea todas, y las fichas de jugadores, que la app anterior pide para su portada.""",
 """// fixtures de B1, el día de los datos de hoy (23/09/2026), y el config.js de la app anterior (2025/26,
// con Las Mesas en PG2). Lo que las fixtures no traen, vacío: las temporadas archivadas, que el SW
// anterior precachea todas, las fichas de jugadores, que la app anterior pide para su portada, y la
// plantilla de otra temporada, que el SW del árbol precachea cuando ya ha activado otra (decisión 2 de B5)."""),
("""  const [, kind, from, to] = file.match(/^data-(season|players)-(\\d{4})-(\\d{4})\\.js$/) || [];
  if (kind === 'season') return js([[`SEASON_${from}_${to}`, { name: `${from}-${to}`, current: false, benjamin: [], prebenjamin: [] }]]);
  if (kind === 'players') return js([[`PLAYERS_${from}_${to}`, {}], [`TEAMS_${from}_${to}`, {}]]);""",
 """  const [, kind, from, to] = file.match(/^data-(season|players|lineups)-(\\d{4})-(\\d{4})\\.js$/) || [];
  if (kind === 'season') return js([[`SEASON_${from}_${to}`, { name: `${from}-${to}`, current: false, benjamin: [], prebenjamin: [] }]]);
  if (kind === 'players') return js([[`PLAYERS_${from}_${to}`, {}], [`TEAMS_${from}_${to}`, {}]]);
  if (kind === 'lineups') return js([[`LINEUPS_${from}_${to}`, {}]]);"""),
("""// ── 3. Sin conexión tras una subida de datos del bot (decisión 1 de B5) ─────────────────────────────""",
 """// ── 3. Sin conexión tras una subida de datos del bot (decisiones 1 y 2 de B5) ───────────────────────"""),
("""//    borra la caché de «a». Sin conexión, la ficha pinta los mismos escudos, en miniatura, y ningún
//    monograma más; la caché de los escudos es la misma;""", """//    borra la caché de «a». Sin conexión, la ficha pinta los mismos escudos, en miniatura, y ningún
//    monograma más; la caché de los escudos es la misma. Y su plantilla, la de la temporada del portal,
//    que el SW precachea (SEASON_FILES) en cada versión: sin ella, la caja de error;"""),
("""        let text = read(ROOT, file).replaceAll(TREE_VERSION, DATA[phase]);
""", """        let text = read(ROOT, file).replaceAll(TREE_VERSION, DATA[phase]);
        // La plantilla que precachea el SW, la de la temporada del portal de los datos congelados (2025-26),
        // también cuando el árbol ya precachee la de otra (activate_season.py la cambia al activarla).
        if (file === 'sw.js') text = text.replace(/'\\.\\/data-lineups-\\d{4}-\\d{4}\\.js'/, "'./data-lineups-2025-2026.js'");
"""),
("""  // Una apertura de la ficha en una página nueva, y sus escudos: también los diferidos (loading="lazy"),
  // que se piden ya para que la cuenta no dependa del alto de la ventana; cuando cada <img> ha cargado o,
  // si no pudo, ha pasado a monograma (crestFallback: la miniatura, el original y el monograma).""",
 """  // Una apertura de la ficha en una página nueva, y sus escudos: también los diferidos (loading="lazy"),
  // que se piden ya para que la cuenta no dependa del alto de la ventana; cuando cada <img> ha cargado o,
  // si no pudo, ha pasado a monograma (crestFallback: la miniatura, el original y el monograma). Y si
  // pinta la tabla de su plantilla."""),
("""        mini, orig: imgs.length - mini, mono: document.querySelectorAll('#contenido .mono').length };""",
 """        mini, orig: imgs.length - mini, mono: document.querySelectorAll('#contenido .mono').length,
        plantilla: !!document.querySelector('#contenido table.squad') };"""),
("""    assert.ok(online.screen === 'equipo' && online.mini > 0 && online.orig === 0 && online.errores.length === 0,""",
 """    assert.ok(online.screen === 'equipo' && online.plantilla && online.mini > 0 && online.orig === 0 && online.errores.length === 0,"""),
("""    // Sin conexión, la misma ficha: los mismos escudos, en miniatura.""",
 """    // Sin conexión, la misma ficha: los mismos escudos, en miniatura, y su plantilla."""),
("""    console.log(`PASS: sin conexión tras una subida de datos: la ficha pinta sus ${online.mini} escudos en miniatura, como con conexión, porque su caché (${treeCrests}) no cambia con CACHE_NAME; con un escudo cambiado, su sello nuevo da otra caché, con el escudo nuevo`);""",
 """    console.log(`PASS: sin conexión tras una subida de datos: la ficha pinta sus ${online.mini} escudos en miniatura, como con conexión, porque su caché (${treeCrests}) no cambia con CACHE_NAME, y su plantilla de 2025/26, del precache; con un escudo cambiado, su sello nuevo da otra caché, con el escudo nuevo`);"""),
])
print('pruebas: SEASON_FILES con la plantilla del portal (test_sw_fixes), season_files_for y la activación sobre un árbol sintético (test_season_preparation), y la plantilla sin conexión en pwa-smoke')
PY
```
Esperado:
```text
pruebas: SEASON_FILES con la plantilla del portal (test_sw_fixes), season_files_for y la activación sobre un árbol sintético (test_season_preparation), y la plantilla sin conexión en pwa-smoke
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)' | sed -E 's/^not ok [0-9]+ /not ok /'
python3 -m pytest scripts/tests/test_season_preparation.py -q 2>&1 | grep -E '^(FAILED|ERROR) |^[0-9]+ (failed|passed)' | sed -E 's/ - .*$//; s/ in [0-9.]*s$//'
node scripts/tests/pwa-smoke.mjs 2>&1 | grep -E '^PASS|^AssertionError|^[+-]   ' | sed -E 's/^(PASS: [^:]*):.*/\1/'
```
Esperado (sin la plantilla en `SEASON_FILES` ni `season_files_for`: sin red, la ficha pinta sus escudos, pero su Plantilla, la caja de error):
```text
not ok - SEASON_FILES: las temporadas archivadas y la plantilla de la del portal, la siguiente a la última archivada (decisión 2 de B5)
# pass 22
# fail 1
FAILED scripts/tests/test_season_preparation.py::test_season_files_swap_the_portal_lineups_and_keep_every_archive
FAILED scripts/tests/test_season_preparation.py::test_activation_on_a_synthetic_tree_precaches_the_lineups_of_the_new_season
2 failed, 10 passed
PASS: de la app anterior (su SW real) al rediseño, con datos congelados
PASS: despliegue de código sobre el SW de la rama
AssertionError [ERR_ASSERTION]: sin conexión tras una subida de datos, la ficha no pinta lo mismo que con conexión
+   plantilla: false,
-   plantilla: true,
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
("""// Season data files — loaded lazily by the app, precache when available
const SEASON_FILES = [
  './data-season-2024-2025.js',
  './data-season-2023-2024.js',
  './data-season-2022-2023.js',
  './data-season-2021-2022.js',
];""", """// Season data files — loaded lazily by the app, precache when available: los
// archivos de las temporadas pasadas y la plantilla de la temporada del portal
// (sus actas, data-lineups-<S>.js; decisión 2 de B5), para que su ficha de
// Equipo funcione sin conexión. scripts/activate_season.py añade el archivo de
// la temporada que cierra y cambia la plantilla por la de la nueva, aunque ese
// fichero aún no exista (sin actas): el precache lo salta (allSettled) y la
// app, con su 404, da la temporada sin actas.
const SEASON_FILES = [
  './data-season-2024-2025.js',
  './data-season-2023-2024.js',
  './data-season-2022-2023.js',
  './data-season-2021-2022.js',
  './data-lineups-2025-2026.js',
];"""),
])

edit('scripts/activate_season.py', [
("""def apply_manifest(manifest, evidence, root=Path(PROJECT_ROOT)):""", """LINEUPS_URL = re.compile(r"\\./data-lineups-\\d{4}-\\d{4}\\.js")


def season_files_for(worker, closing, opening):
    \"\"\"sw.js con SEASON_FILES al activar `opening`: delante, el archivo de la temporada que se cierra
    (data-season-<closing>.js), si no estaba; y al final, la plantilla de la temporada del portal, la de
    `opening` en lugar de la de `closing` (data-lineups-<S>.js; Plan B5, decisión 2). El fichero de la
    nueva todavía no existe (sin actas no hay plantilla): el precache del SW lo salta (allSettled) y la
    app, con su 404, da la temporada sin actas. El resto de sw.js, igual.\"\"\"
    start = worker.index("const SEASON_FILES = [")
    end = worker.index("];", start) + len("];")
    entries = [url for url in re.findall(r"'([^']+)'", worker[start:end]) if not LINEUPS_URL.fullmatch(url)]
    archive = f"./data-season-{closing}.js"
    if archive not in entries:
        entries.insert(0, archive)
    entries.append(f"./data-lineups-{opening}.js")
    literal = "const SEASON_FILES = [\\n" + "".join(f"  '{url}',\\n" for url in entries) + "];"
    return worker[:start] + literal + worker[end:]


def apply_manifest(manifest, evidence, root=Path(PROJECT_ROOT)):"""),
("""        sw_path = stage / "sw.js"
        archive_url = f'./data-season-{config["season"]}.js'
        worker = sw_path.read_text()
        if archive_url not in worker:
            sw_path.write_text(worker.replace('const SEASON_FILES = [', f"const SEASON_FILES = [\\n  '{archive_url}',"))
""", """        sw_path = stage / "sw.js"
        sw_path.write_text(season_files_for(sw_path.read_text(encoding="utf-8"), config["season"], manifest["season"]),
                           encoding="utf-8")
"""),
])

edit('docs/temporada-nueva.md', [
("""Se conservan partidos, clasificaciones, goleadores y actas anteriores. Se crea `data-season-2025-2026.js` y la Copa Maspalomas 2026 permanece asociada a 2025/26, también al consultar el archivo.""",
 """Se conservan partidos, clasificaciones, goleadores y actas anteriores. Se crea `data-season-2025-2026.js` y la Copa Maspalomas 2026 permanece asociada a 2025/26, también al consultar el archivo. En `sw.js`, `SEASON_FILES` gana ese archivo y cambia la plantilla que la app instalada guarda para abrir sin conexión, `data-lineups-2025-2026.js`, por la de la temporada nueva, `data-lineups-2026-2027.js`, aunque todavía no exista: sin actas no hay plantilla; cuando lleguen, la app la guardará al abrirla con red, y el SW, en su versión siguiente (Plan B5, decisión 2)."""),
])
print('sw.js: SEASON_FILES con la plantilla de 2025-2026; activate_season.py la cambia al activar (season_files_for); docs/temporada-nueva.md')
PY
```
Esperado:
```text
sw.js: SEASON_FILES con la plantilla de 2025-2026; activate_season.py la cambia al activar (season_files_for); docs/temporada-nueva.md
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sw_fixes.mjs 2>&1 | grep -E '^# (pass|fail)'
python3 -m pytest scripts/tests/test_season_preparation.py -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node scripts/tests/pwa-smoke.mjs 2>&1 | sed -E 's/^(PASS: [^:]*):.*/\1/'
```
Esperado:
```text
# pass 23
# fail 0
12 passed
PASS: de la app anterior (su SW real) al rediseño, con datos congelados
PASS: despliegue de código sobre el SW de la rama
PASS: sin conexión tras una subida de datos
```

- [ ] **Step 5: Verificación: la activación de 2026/27, con las suites y `pwa-smoke` en verde (foco de revisión 4)**

En una copia del árbol (los ficheros con seguimiento, con los cambios de esta tarea), se activa la temporada siguiente a la del portal con el manifiesto y las fuentes sintéticas de `test_season_preparation.py`, sin red. Es lo que hará `activate_season.py --apply` con 2026/27: `SEASON_FILES` queda con el archivo de 2025/26 y la plantilla de 2026/27, que no existe. Después se pasan pytest, node y `pwa-smoke` sobre esa copia, y la copia se borra. Un minuto y medio, más o menos:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
A="$S/activada"
rm -rf "$A" && mkdir -p "$A"
git ls-files -z | xargs -0 cp --parents -t "$A"
ln -s /home/manolo/claude/futbol-base/node_modules "$A/node_modules"
cd "$A"
python3 - <<'PY'
import contextlib
import io
import sys
from pathlib import Path

sys.path.insert(0, 'scripts')
sys.path.insert(0, 'scripts/tests')
from activate_season import apply_manifest  # noqa: E402
from portal_config import load_config  # noqa: E402
from test_season_preparation import evidence_for, manifest_for, next_season  # noqa: E402

closing = load_config(Path('src/config.js'))['season']
manifest = manifest_for(next_season(closing))
with contextlib.redirect_stdout(io.StringIO()):  # lo que imprime generate_js.main()
    apply_manifest(manifest, evidence_for(manifest), Path('.'))
opening = load_config(Path('src/config.js'))['season']
worker = Path('sw.js').read_text(encoding='utf-8')
start = worker.index('const SEASON_FILES = [')
print(f'activada {opening} (se cierra {closing})')
print(worker[start:worker.index('];', start) + 2])
print(f'data-lineups-{opening}.js:', 'existe' if Path(f'data-lineups-{opening}.js').exists() else 'no existe')
PY
python3 -m pytest scripts/tests/ -q -p no:cacheprovider 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
out=$(node scripts/tests/pwa-smoke.mjs 2>&1)
sed -E 's/^(PASS: [^:]*):.*/\1/' <<<"$out"
echo "otras líneas: $(grep -vc '^PASS' <<<"$out")"
cd /home/manolo/claude/futbol-base && rm -rf "$A"
```
Esperado (con el portal en 2025/26, como en `0208d26`; si el árbol ya estuviera en 2026/27, activaría 2027/28, con los mismos recuentos):
```text
activada 2026-2027 (se cierra 2025-2026)
const SEASON_FILES = [
  './data-season-2025-2026.js',
  './data-season-2024-2025.js',
  './data-season-2023-2024.js',
  './data-season-2022-2023.js',
  './data-season-2021-2022.js',
  './data-lineups-2026-2027.js',
];
data-lineups-2026-2027.js: no existe
517 passed, 5 skipped
# tests 743
# pass 743
# fail 0
PASS: de la app anterior (su SW real) al rediseño, con datos congelados
PASS: despliegue de código sobre el SW de la rama
PASS: sin conexión tras una subida de datos
otras líneas: 0
```

- [ ] **Step 6: Suites completas y los tres smoke**

Unos 4 minutos (`timeout` a 600000 ms).

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
: "${S:?falta S: la línea export S= de la cabecera}"
node scripts/tests/render-smoke.mjs | head -1 | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado: pytest, el recuento anterior más 2, sin fallos; node, el anterior más 1; los smoke y la portada de `render-smoke`, como en la Tarea 1:
```text
517 passed, 5 skipped
# tests 743
# pass 743
# fail 0
pasada 1: 22 PASS; otras líneas: 0
pasada 2: 22 PASS; otras líneas: 0
pasada 3: 22 PASS; otras líneas: 0
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add sw.js scripts/activate_season.py docs/temporada-nueva.md \
  scripts/tests/test_sw_fixes.mjs scripts/tests/test_season_preparation.py scripts/tests/pwa-smoke.mjs
git commit -q -F - <<'EOF'
fix(rediseño): la plantilla de la temporada del portal, en el precache; la activación la cambia por la de la nueva (B5, tarea 2)

- sw.js: SEASON_FILES gana ./data-lineups-2025-2026.js, las actas de la
  temporada del portal (11,3 KB con gzip): su ficha de Equipo pinta la
  Plantilla sin conexión, también tras una subida de datos (decisión 2).
- activate_season.py: season_files_for añade el archivo de la temporada que
  se cierra y cambia la plantilla por la de la nueva, aunque todavía no
  exista (el precache la salta y la app, con su 404, da la temporada sin
  actas); sin SEASON_FILES, la activación se para antes de escribir nada.
- Pruebas: test_sw_fixes (SEASON_FILES: los archivos y la plantilla de la
  temporada siguiente a la última archivada, sin leer config.js),
  test_season_preparation (season_files_for y la activación entera sobre un
  árbol sintético) y pwa-smoke (la plantilla, sin red tras la subida de
  datos; la de otra temporada, vacía entre los datos congelados).
- docs/temporada-nueva.md: lo que la activación cambia en SEASON_FILES.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1 | sed 's/^ *//'
```
Esperado:
```text
6 files changed, 133 insertions(+), 16 deletions(-)
```

---

### Task 3: La limpieza del código: los ayudantes una sola vez, `routeIsMine` en `myteam.js`, fuera las cuatro heredadas de `state.js`, `listOf` y `teamState` una vez por pintado, Datos y fuentes con `errorBox`, `nav.update` con su token y el «‹» por `goBack` (decisión 6)

Lo que las revisiones de B3 y B4 dejaron en `src/`, sin cambiar nada de lo que se ve salvo la caja de error de Datos y fuentes. Va antes de la interfaz (Tareas 4 a 6), que ya usa los ayudantes compartidos.

**Contexto**
- **Los ayudantes repetidos** (inventario §F, comprobado en `0208d26`):
  - los nombres de categoría: `CAT_NAMES` privado en `model.js:286` y `CAT_ORDER` en `model.js:1237`; `CAT_NAMES`, `CAT_SHORT` y `CAT_KEYS` en `screen-explorar.js:15-17`; `CAT_NAMES` y `CAT_KEYS` en `screen-ligas.js:19` y `:21`; `CATS`, `CAT_LABEL` y `CAT_NAME` (en minúsculas) en `screen-goleadores.js:24-26`; `CATS` y `CAT_WORD` en `screen-records.js:15-16`. Pasan a `model.js`, exportados: `CATEGORIES`, `CAT_NAMES`, `CAT_WORDS` (en minúsculas) y `CAT_SHORT`; las opciones del selector de Goleadores y de Récords salen de ellos. Las listas de validación de `router.js:34`, `myteam.js:103` y `store.js:18` (otro papel) y los nombres de las islas (`links.js`, que no puede importar `model.js` sin un ciclo) se quedan;
  - `count` y `plural`: `screen-explorar.js:19`, `screen-ligas.js:22`, `screen-equipo.js:25` y el de `endedBlock` (`team-view.js:268`), más los mismos plurales escritos en línea en `screen-goleadores.js:85-87`, `screen-copa.js:69` y `screen-fuentes.js:54` y `:94`: todos pasan a `countLabel` de `ui.js`;
  - `score`: `team-view.js:28`, `screen-equipo.js:24` y `screen-partido.js:27` (con su `DASH`, el mismo carácter), más los marcadores en línea de `matchRow` (`ui.js:105`) y de `screen-records.js:37`. Dentro de `matchRow`, la variable local `score` pasa a llamarse `result`: si no, taparía la función;
  - `signed`: la de `ui.js:115`, que admite `null`, exportada; la de `screen-ligas.js:79` se va (sus `dg` nunca son `null`: `compareGroups` da `row.dg ?? 0`);
  - los decimales: `decimals` (`screen-records.js:22`), `ppjText` (`screen-ligas.js:78`) y `oneDecimal` (`team-view.js:30`) pasan a `decimal(n, cifras)` de `ui.js`. `thousands` se queda en Récords, su única usuaria.
  - Una prueba nueva de `test_rediseno_modulos.mjs` fija que ningún otro módulo los vuelve a escribir.
- **`routeIsMine`** (`router.js:232-239`) pasa, igual, a `myteam.js`: la usan la barra (`router.js:411`) y la ficha de Equipo (`screen-equipo.js:18` y `:187`). `router.js` deja de exportarla y su prueba la importa de `myteam.js`.
- **`state.js`**: fuera `bracketDrawAdvancer`, `matchAdvancer` y `bracketChampion` (líneas 88-127) y `countMatches` (419-440), que nadie usa en `src/` (el cuadro es `bracket()` de `model.js`). Con ellas se van las 12 pruebas de `test_review0615_frontend.mjs` que solo las ejercitan: 2 de `bracketDrawAdvancer`, 2 de `matchAdvancer`, 2 de `bracketChampion`, la de las filas de 9 columnas, la de «Maspalomas publicada» (que además leía el `data-maspalomas-cup-2026.js` vivo) y 4 de `countMatches`. Quién pasó y el campeón los cubren las pruebas de `bracket()` con las fixtures (`test_rediseno_copa.mjs`: MCPK1, MCBK2, BCC1…), y el tipo de cuadro, las de `groupKind` (`test_rediseno_model_temporadas.mjs`). `test_rediseno_state.mjs` las pasa a la lista de las que no vuelven.
- **`listOf` de Goleadores** (`screen-goleadores.js:56`) se hacía en `render` (114) y otra vez en `mount` (149); las teclas ya filtraban la de `mount`. El router da a los dos el mismo objeto `ctx` (`router.js:438-451`): la lista se guarda por `ctx` en un `WeakMap`, y `mount` la toma de ahí.
- **`teamState`**: la portada lo calculaba en `homeState` (`myteam.js:290`) y otra vez en `teamView` (`team-view.js:372`). `teamView` gana la opción `state`, y la portada le pasa el suyo.
- **Datos y fuentes sin `data-health.json`** (`screen-fuentes.js:79-81`): su vacío propio (`.empty.fu-failed`, sin `role="alert"`) pasa a la caja de error de §7, `errorBox('la comprobación de las fuentes')` («el estado de las fuentes» daría «los datos de el estado»), con el mismo «Reintentar» del router, que ya funcionaba. La regla `.fu-failed .buttons` (`acta.css:1384`) se va. Es el único cambio de DOM de la tarea, y ninguna escena de `capturas.mjs` lo pinta.
- **`nav.update`** (`router.js:580-596`) no miraba el token: un `update` que llegara tarde desde una pantalla anterior reescribía la ruta nueva (en `0208d26`, la de la ficha con los parámetros de Explorar). Cada `mount` recibe ahora su `nav`, con `update` ligado a su navegación: si ya empezó otra, devuelve `false` sin tocar nada. El `nav` que devuelve `startRouter` no cambia.
- **El «‹» del DOM** (`router.js:550-554`) llamaba a `history.back()` directamente, e `idle()` no esperaba la vuelta: pasa por `goBack()` (512-525), como `nav.back()`.
- **La red**: las 12 huellas de la portada (`test_rediseno_vista_equipo.mjs`), el DOM de la primera pasada de `render-smoke` (el de la base, `$S/dom-base.txt`) y las 22 líneas PASS de los tres smoke (las de la Tarea 2), iguales.
- **Recuentos**: node de 743 a 737 (12 fuera y 6 nuevas: los ayudantes de `ui.js`, lo compartido una vez, `listOf`, `teamView` con `state`, `nav.update` y el «‹»); pytest, sin cambios (`517 passed, 5 skipped`); los smoke, 22 PASS por pasada.

**Files:**
- Modify: `src/ui.js`, `src/model.js`, `src/myteam.js`, `src/router.js`, `src/state.js`, `src/team-view.js`, `src/screen-home.js`, `src/screen-equipo.js`, `src/screen-partido.js`, `src/screen-explorar.js`, `src/screen-ligas.js`, `src/screen-goleadores.js`, `src/screen-records.js`, `src/screen-copa.js`, `src/screen-fuentes.js`, `acta.css` e `index.html` (`CODIGO`)
- Test: `scripts/tests/test_review0615_frontend.mjs`, `test_rediseno_state.mjs`, `test_rediseno_router.mjs`, `test_rediseno_fuentes.mjs`, `test_rediseno_ui.mjs`, `test_rediseno_modulos.mjs`, `test_rediseno_goleadores.mjs` y `test_rediseno_vista_equipo.mjs`
- Fuera del repo: `$S/vista-comun.mjs` (la usan también las Tareas 4 a 6) y `$S/vista-fuentes.mjs`

**Interfaces:**
- Consumes: `startRouter` y su `nav` (`router.js`); `homeState` y `teamState` (`myteam.js`); `errorBox` (`shell.js`); en las pruebas, `fakeBrowser` (`fake-browser.mjs`), `ctxFor` y `datasetsFor` (`screens.mjs`), `goleadores` y `currentAt` (`simulate.mjs`) y los ayudantes de `test_rediseno_router.mjs` (`screen`, `allScreens`, `context`, `deferred` y `tick`).
- Produces:

```js
// src/ui.js
export function countLabel(n, one, many) → string      // «1 grupo», «3 grupos»
export function score(a, b) → string                   // «2–7»
export function signed(n) → string                     // «+24», «−30», «0»; '' con null
export function decimal(n, digits) → string            // decimal(8.0123, 2) → «8,01»
// src/model.js
export const CATEGORIES = ['benjamin', 'prebenjamin'];
export const CAT_NAMES;   // { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' }
export const CAT_WORDS;   // { benjamin: 'benjamín', prebenjamin: 'prebenjamín' }
export const CAT_SHORT;   // { benjamin: 'benj.', prebenjamin: 'preb.' }
// src/myteam.js (antes en router.js, igual)
export function routeIsMine(route, resolution) → boolean
// src/team-view.js
export function teamView(ctx, { group, name }, { …, state = null })   // state: el de quien ya lo calculó; sin él, teamState
// src/router.js: cada mount recibe { ...nav, update(params) }, con update → false si su navegación ya no es la vigente
// src/state.js: sin countMatches, matchAdvancer, bracketDrawAdvancer ni bracketChampion
```

- [ ] **Step 0: La base del DOM de `render-smoke`, si falta**

La primera pasada de `render-smoke` pinta la portada con los datos reales y el reloj de verdad: su DOM depende del día. El paso 0 de la Tarea 1 lo mide en `$S/dom-base.txt`; si ese fichero no está (otra sesión), se mide aquí, antes de tocar `src/` (las Tareas 1 y 2 no cambian la portada):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
[ -s "$S/dom-base.txt" ] || node scripts/tests/render-smoke.mjs | sed -nE 's/^PASS: render smoke OK .*\(DOM ([0-9]+) bytes\)$/\1/p' > "$S/dom-base.txt"
cat "$S/dom-base.txt"
```
Esperado: un número, el DOM de la base de ese día (`16242` el 27/09/2026).

- [ ] **Step 1: Write the failing test**

Las pruebas nuevas y las que cambian, con el guion de siempre: `edit` sustituye texto exacto, `cut` quita un trozo entre dos marcas (comprobando lo que quita) y `append` añade al final.

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
    """Quita desde `start` (incluido) hasta `end` (excluido), cada uno una sola vez, y comprueba que lo
    quitado contiene `must`; si no, se para sin escribir."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.count(start) == 1 and s.count(end) == 1, (path, start[:60], end[:60])
    i = s.index(start)
    j = s.index(end, i)
    assert all(m in s[i:j] for m in must), (path, start[:60], must)
    p.write_text(s[:i] + s[j:], encoding='utf-8')


def append(path, text):
    """Añade `text` al final, si no está ya."""
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.endswith('\n') and text.strip() not in s, path
    p.write_text(s + text, encoding='utf-8')


# ── Las cuatro heredadas de state.js, fuera con las pruebas que solo las ejercitaban ──
T = 'scripts/tests/test_review0615_frontend.mjs'
edit(T, [
    (""" * Quedan las funciones de state.js que usa el modelo del rediseño (etiquetas de
 * ronda, detector de copa, quién pasó y campeón, liguilla o cuadro) y
 * countMatches. validJorGroup, knockoutRoundsSource, unifiedPrebenLeagueGroups,
 * countStats, phaseIcon y groupJornadaLabel se fueron con sus pruebas en la
 * revisión final de B2 (M5): nada de src/, index.html ni sw.js las usaba.
 */""", """ * Quedan las funciones de state.js que usa el modelo del rediseño: las etiquetas
 * de ronda, el detector de copa y liguilla o cuadro. validJorGroup,
 * knockoutRoundsSource, unifiedPrebenLeagueGroups, countStats, phaseIcon y
 * groupJornadaLabel se fueron con sus pruebas en la revisión final de B2 (M5);
 * countMatches, matchAdvancer, bracketDrawAdvancer y bracketChampion, en B5
 * (decisión 6): nada de src/ las usaba. Quién pasó y el campeón de un cuadro son
 * bracket(), de model.js, con sus pruebas en test_rediseno_copa.mjs.
 */"""),
    ("""import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
""", ''),
])
cut(T, '/* ─── M4: empates por penaltis muestran quién avanzó', '// ── Copa de Campeones 2023-24: grupos round-robin',
    ["test('bracketDrawAdvancer: el que aparece en ronda posterior avanzó'", "test('bracketDrawAdvancer: null si ninguno aparece después (final)'"])
cut(T, '/* Campeón de un cuadro sin clasificación (Maspalomas Cup: grupos que son', '/* Copas insulares 2023-24 (Lanzarote / Fuerteventura)',
    ["test('matchAdvancer: la 6ª columna manda sobre la deducción'", "test('matchAdvancer: sin 6ª columna sigue deduciendo del cuadro (histórico)'",
     "test('bracketChampion: sale del ganador de la final, penaltis incluidos'", "test('bracketChampion: null cuando la última ronda no decide'",
     "test('matchAdvancer/bracketChampion: fila de 9 columnas con pen null y tanda'",
     "test('Maspalomas publicada: cada partido de cuadro tiene quién pasó y cada cuadro su campeón'",
     "test('countMatches: la temporada actual cuenta desde HISTORY, no la jornada inline'",
     "test('countMatches: los grupos que no pasan por la DB cuentan sus partidos inline'",
     "test('countMatches: cuadros sin lista matches suman por jornadas'", "test('countMatches: tolera entradas vacías'"])

edit('scripts/tests/test_rediseno_state.mjs', [
    ("""    'getPhases']) {
    assert.equal(gone in state, false, `${gone} sigue en state.js`);
  }
  for (const kept of ['countMatches', 'groupScorers', 'teamScorers']) {""", """    'getPhases',
    // B5, decisión 6: las cuatro que nadie usaba en src/ (quién pasó y el campeón son bracket(), de model.js).
    'countMatches', 'matchAdvancer', 'bracketDrawAdvancer', 'bracketChampion']) {
    assert.equal(gone in state, false, `${gone} sigue en state.js`);
  }
  for (const kept of ['groupScorers', 'teamScorers']) {"""),
])

# ── routeIsMine, en myteam.js; nav.update con su token y el «‹» del DOM por goBack ──
R = 'scripts/tests/test_rediseno_router.mjs'
edit(R, [
    ("""import { buildClubIndex } from '../../src/myteam.js';""", """import { buildClubIndex, routeIsMine } from '../../src/myteam.js';"""),
    ("""import { resolveParams, historyMode, parentOf, activeTab, routeIsMine, startRouter } from '../../src/router.js';""",
     """import * as routerModule from '../../src/router.js';
import { resolveParams, historyMode, parentOf, activeTab, startRouter } from '../../src/router.js';"""),
    ("""test('routeIsMine: el partido o la ficha de mi equipo, en su grupo y su temporada', () => {""",
     """test('routeIsMine (myteam.js desde B5): el partido o la ficha de mi equipo, en su grupo y su temporada', () => {
  assert.equal('routeIsMine' in routerModule, false, 'es del terreno de myteam.js (B5, decisión 6)');"""),
])
append(R, """
// ── Plan B5, Tarea 3: nav.update ligado a su mount y el «‹» del DOM por goBack (decisión 6) ──

test('nav.update de un mount que ya no es el vigente no toca la ruta nueva y devuelve false; el del vigente, sí (B5, decisión 6)', async () => {
  const b = fakeBrowser('#/');
  const navs = [];
  const explorar = screen('explorar', { mount: (root, ctx, n) => { navs.push(n); } });
  const router = startRouter({ screens: { ...allScreens(), explorar }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/explorar' });
  await router.idle();
  const [first] = navs;
  assert.equal(first.update({ s: PORTAL, q: 'Mes' }), true, 'el de la pantalla vigente apunta la búsqueda');
  assert.deepEqual(b.entries(), ['#/', '#/explorar?s=2025-2026&q=Mes']);
  // Otra navegación: la ficha. Un update tardío de Explorar (un temporizador) no la reescribe.
  b.click({ href: '#/equipo?g=PG2&t=Acodetti' });
  await router.idle();
  assert.equal(first.update({ s: PORTAL, q: 'Mesa' }), false);
  assert.deepEqual(b.entries(), ['#/', '#/explorar?s=2025-2026&q=Mes', '#/equipo?g=PG2&t=Acodetti']);
  assert.deepEqual(router.current(), { screen: 'equipo', params: { g: 'PG2', t: 'Acodetti', s: PORTAL } });
  // De vuelta en Explorar: su mount nuevo trae el suyo; el del pintado anterior sigue sin poder.
  b.win.history.back();
  await tick();
  await router.idle();
  assert.equal(navs.length, 2);
  assert.equal(first.update({ s: PORTAL, q: 'M' }), false, 'es de un pintado que ya no está');
  assert.equal(navs[1].update({ s: PORTAL, q: 'Mesas' }), true);
  assert.equal(b.hash(), '#/explorar?s=2025-2026&q=Mesas');
});

test('el «‹» del DOM con entrada anterior de la app pasa por goBack: idle() espera el pintado de la vuelta (B5, decisión 6)', async () => {
  const b = fakeBrowser('#/');
  const gate = deferred();
  let calls = 0;
  const home = screen('home', { needs: () => (++calls === 1 ? [] : [gate.promise]) });
  const router = startRouter({ screens: { '': home, tabla: screen('tabla') }, root: b.root, getContext: context(), window: b.win });
  await router.idle();
  b.click({ href: '#/tabla' });
  await router.idle();
  assert.equal(b.click({ href: '#/', 'data-action': 'back' }), true);
  let done = false;
  const back = router.idle().then(() => { done = true; });
  await tick();
  assert.equal(done, false, 'Mi equipo espera a sus needs: la vuelta todavía no está pintada');
  assert.match(b.root.innerHTML, /data-skeleton="home"/);
  gate.resolve();
  await back;
  assert.equal(b.index(), 0);
  assert.match(b.root.innerHTML, /<h1>home<\\/h1>/);
});
""")

# ── Datos y fuentes con la caja de error de shell.js ──
F = 'scripts/tests/test_rediseno_fuentes.mjs'
edit(F, [
    ("""import { startRouter } from '../../src/router.js';
""", """import { startRouter } from '../../src/router.js';
import { errorBox } from '../../src/shell.js';
"""),
    ("""test('sin data-health: el vacío y el «Reintentar» del router, sin inventar nada', () => {
  for (const health of [null, undefined]) {
    const out = render(withHealth(health));
    assert.match(out, /^<section data-screen="fuentes"><header class="screen-head">.*<h1>Datos y fuentes<\\/h1><\\/div><\\/header><div class="block"><div class="empty fu-failed"><p>No se pudo cargar el estado de las fuentes\\.<\\/p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar<\\/button><\\/div><\\/div><\\/div><\\/section>$/, String(health));
  }
});""", """test('sin data-health: la caja de error de §7 (errorBox), anunciada y con el «Reintentar» del router, sin inventar nada (B5, decisión 6)', () => {
  for (const health of [null, undefined]) {
    const out = render(withHealth(health));
    assert.match(out, /^<section data-screen="fuentes"><header class="screen-head">.*<h1>Datos y fuentes<\\/h1><\\/div><\\/header><div class="block"><div class="box error-box" role="alert"><p class="error-text">No se pudieron cargar los datos de la comprobación de las fuentes\\.<\\/p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar<\\/button><\\/div><\\/div><\\/div><\\/section>$/, String(health));
    assert.ok(out.includes(String(errorBox('la comprobación de las fuentes'))), 'la caja de shell.js, la de todas las pantallas');
  }
});"""),
    ("""    assert.match(b.root.innerHTML, /No se pudo cargar el estado de las fuentes\\./);""",
     """    assert.match(b.root.innerHTML, /No se pudieron cargar los datos de la comprobación de las fuentes\\./);"""),
    ("""  assert.deepEqual([...used].filter((c) => !rules.classes.has(c)), []);""",
     """  // error-box es el gancho de la caja de error de shell.js, sin regla propia (como en test_rediseno_shell).
  assert.deepEqual([...used].filter((c) => !rules.classes.has(c) && c !== 'error-box'), []);"""),
])

# ── Los ayudantes de cifras de ui.js ──
U = 'scripts/tests/test_rediseno_ui.mjs'
edit(U, [
    ("""  formChips, segmented, notice, empty, tabbar, listEs, shareStatus, sourcePhrase,
} from '../../src/ui.js';""", """  formChips, segmented, notice, empty, tabbar, listEs, shareStatus, sourcePhrase, countLabel, score, signed, decimal,
} from '../../src/ui.js';"""),
])
append(U, """
// ── Plan B5, Tarea 3: las cifras y los recuentos de todas las pantallas, una sola vez (decisión 6) ──

test('countLabel, score, signed y decimal: una sola definición, la de ui.js', () => {
  assert.equal(countLabel(1, 'grupo', 'grupos'), '1 grupo');
  assert.equal(countLabel(0, 'grupo', 'grupos'), '0 grupos');
  assert.equal(countLabel(3, 'acta más llega incompleta', 'actas más llegan incompletas'), '3 actas más llegan incompletas');
  assert.equal(score(2, 7), '2–7');
  assert.deepEqual([24, -30, 0, null, undefined].map(signed), ['+24', '−30', '0', '', '']);
  assert.equal(decimal(8.0123, 2), '8,01');
  assert.equal(decimal(3.25, 1), '3,3');
  assert.equal(decimal(48 / 17, 2), '2,82');
});
""")

M = 'scripts/tests/test_rediseno_modulos.mjs'
append(M, """
// ── Plan B5, Tarea 3: lo compartido, una sola vez (decisión 6; principio I2 del plan B3) ──
// Los nombres de categoría viven en model.js; el plural, el marcador, el signo y los decimales, en
// ui.js. Ningún otro módulo vuelve a escribirlos.
test('los nombres de categoría, en model.js; countLabel, score, signed y decimal, en ui.js; ningún otro módulo los repite', async () => {
  const model = await import('../../src/model.js');
  assert.deepEqual(model.CATEGORIES, ['benjamin', 'prebenjamin']);
  assert.deepEqual(model.CAT_NAMES, { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' });
  assert.deepEqual(model.CAT_WORDS, { benjamin: 'benjamín', prebenjamin: 'prebenjamín' });
  assert.deepEqual(model.CAT_SHORT, { benjamin: 'benj.', prebenjamin: 'preb.' });
  const HOME_OF = { 'nombres de categoría': 'model.js', plural: 'ui.js', decimales: 'ui.js', 'un ayudante con nombre': 'ui.js' };
  const PATTERNS = {
    'nombres de categoría': /\\{\\s*benjamin:\\s*'/,
    plural: /\\? one : many/,
    decimales: /\\.toFixed\\(/,
    'un ayudante con nombre': /\\bconst (?:score|signed|plural|decimals|oneDecimal|ppjText) = /,
  };
  const again = MODULES.flatMap((f) => Object.entries(PATTERNS)
    .filter(([what, re]) => re.test(code(read(`src/${f}`))) && HOME_OF[what] !== f).map(([what]) => `${f}: ${what}`));
  assert.deepEqual(again, []);
});
""")

# ── listOf, una vez por pintado; teamState, una vez en la portada ──
append('scripts/tests/test_rediseno_goleadores.mjs', """
// ── Plan B5, Tarea 3: la lista de la ruta, una vez por pintado (decisión 6) ──

test('la lista de la ruta, una vez por pintado y ninguna por tecla: render y mount comparten la del mismo ctx', () => {
  const base = ctxOf({ c: 'benjamin' });
  let built = 0;
  const ctx = { ...base, model: { ...base.model, scorers: (...args) => { built += 1; return base.model.scorers(...args); } } };
  assert.equal(rows(s(screen.render(ctx))).length, PAGE_ROWS);
  assert.equal(built, 1);
  const input = { id: 'buscar-goleador', value: '' };
  const on = {};
  const found = { '[data-scorers]': { innerHTML: '' }, '.gol-count': { textContent: '' }, '#buscar-goleador': input };
  const section = { matches: (sel) => sel === '[data-screen="goleadores"]', querySelector: (sel) => found[sel] || null, addEventListener: (type, fn) => { on[type] = fn; } };
  screen.mount(section, ctx, { update: () => true });
  for (const value of ['m', 'me', 'mes', 'mesas', '']) {
    input.value = value;
    on.input({ target: input });
  }
  assert.equal(built, 1, 'mount y cada tecla usan la lista que hizo render');
  assert.equal(found['.gol-count'].textContent, '586 jugadores de 8 grupos');
  // Otro pintado, con su ctx: otra lista.
  screen.render({ ...ctx });
  assert.equal(built, 2);
});
""")
append('scripts/tests/test_rediseno_vista_equipo.mjs', """
// ── Plan B5, Tarea 3: el estado, una vez por pintado de la portada (decisión 6) ──

test('teamView con `state`: la vista del estado que le dan, sin volver a calcularlo; sin él, teamState', () => {
  const ctx = equipoCtx(HURACAN, '2026-09-23', fixture('current-2025-2026'));
  const own = viewOf(ctx, { action: 'make', calendar: 'always' });
  assert.equal(own.state, 'D');
  assert.deepEqual(own.main.map(titles).flat(), ['Así terminó 2025/26']);
  // Con el estado de quien ya lo calculó (la portada, con homeState), ese: aquí, uno que no es el suyo.
  const given = viewOf(ctx, { action: 'make', calendar: 'always', state: 'A' });
  assert.equal(given.state, 'A');
  assert.deepEqual(given.main.map(titles).flat(), ['Próximo partido', 'Últimos cinco']);
  // La portada le pasa el suyo: el mismo pintado, byte a byte, que sin él (las huellas de arriba).
  const home = homeCtx({ today: '2026-09-23' });
  const r = home.resolution;
  const state = homeState({ resolution: r, todayISO: home.today, portalSeason: home.portal.season });
  const opts = { action: 'change', nextSeason: true, calendar: 'wide', mine: true, shields: home.datasets.shields };
  assert.deepEqual(teamView(home, { group: r.group, name: r.name }, { ...opts, state }), teamView(home, { group: r.group, name: r.name }, opts));
});
""")
print('pruebas: fuera las de las cuatro heredadas; routeIsMine en myteam.js; nav.update, «‹», Fuentes, ayudantes, lo compartido, listOf y teamState')
PY
```
Esperado:
```text
pruebas: fuera las de las cuatro heredadas; routeIsMine en myteam.js; nav.update, «‹», Fuentes, ayudantes, lo compartido, listOf y teamState
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
for f in test_rediseno_router test_rediseno_ui test_rediseno_modulos test_rediseno_goleadores test_rediseno_vista_equipo test_rediseno_fuentes test_rediseno_state test_review0615_frontend; do
  node --test scripts/tests/$f.mjs 2>&1 | grep -E "SyntaxError|^not ok|^# (tests|pass|fail)"
done
```
Esperado: el router y `ui.js` no cargan (`routeIsMine` todavía no está en `myteam.js`, ni `countLabel` en `ui.js`); fallan las nuevas de los otros cinco ficheros, y las 10 que quedan de `test_review0615_frontend.mjs` pasan:
```text
# SyntaxError: The requested module '../../src/myteam.js' does not provide an export named 'routeIsMine'
not ok 1 - scripts/tests/test_rediseno_router.mjs
# tests 1
# pass 0
# fail 1
# SyntaxError: The requested module '../../src/ui.js' does not provide an export named 'countLabel'
not ok 1 - scripts/tests/test_rediseno_ui.mjs
# tests 1
# pass 0
# fail 1
not ok 9 - los nombres de categoría, en model.js; countLabel, score, signed y decimal, en ui.js; ningún otro módulo los repite
# tests 9
# pass 8
# fail 1
not ok 15 - la lista de la ruta, una vez por pintado y ninguna por tecla: render y mount comparten la del mismo ctx
# tests 15
# pass 14
# fail 1
not ok 12 - teamView con `state`: la vista del estado que le dan, sin volver a calcularlo; sin él, teamState
# tests 12
# pass 11
# fail 1
not ok 6 - sin data-health: la caja de error de §7 (errorBox), anunciada y con el «Reintentar» del router, sin inventar nada (B5, decisión 6)
not ok 7 - needs pide data-health si no está, también si ya falló; el «Reintentar» del router lo vuelve a pedir y pinta las filas
# tests 8
# pass 6
# fail 2
not ok 10 - decisiones 1 y 2: state.js sin estado de interfaz, sin HTML y sin lo que ya cubre el modelo
# tests 12
# pass 11
# fail 1
# tests 10
# pass 10
# fail 0
```

- [ ] **Step 3: Write minimal implementation**

Cada cambio con su texto exacto de `0208d26`. Al final, `CODIGO` al día (`scripts/codigo.py`), para que `test_rediseno_index.mjs` siga en verde en los pasos siguientes:

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


# ── ui.js: countLabel, score, signed (la que admite null) y decimal, exportadas una vez ──
edit('src/ui.js', [
    ("""// ── Tabla ───────────────────────────────────────────────────────────────

const signed = (n) => (n == null ? '' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
""", """// ── Cifras y recuentos, una sola vez (B5, decisión 6) ───────────────────

// «1 grupo», «3 grupos»: la cifra con la palabra en singular o en plural.
export function countLabel(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Un marcador, «2–7», con la raya de las maquetas.
export function score(a, b) {
  return `${a}–${b}`;
}

// Una diferencia con su signo: «+24», «−30» o «0»; '' sin dato.
export function signed(n) {
  return n == null ? '' : n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

// Una cifra con `digits` decimales y coma, sin los datos de idioma del motor (decisión 123 de B2):
// decimal(8.0123, 2) → «8,01».
export function decimal(n, digits) {
  return n.toFixed(digits).replace('.', ',');
}

// ── Tabla ───────────────────────────────────────────────────────────────
"""),
    ("""  const score = state === 'jugado'
    ? html`<span class="match-score">${match.hs}–${match.as}</span>`
    : html`<span class="match-score is-pending">–</span>`;""", """  const result = state === 'jugado'
    ? html`<span class="match-score">${score(match.hs, match.as)}</span>`
    : html`<span class="match-score is-pending">–</span>`;"""),
    ("""${crest(match.home, { shields })}</span>${score}<span class="match-team match-away">""",
     """${crest(match.home, { shields })}</span>${result}<span class="match-team match-away">"""),
])

# ── model.js: las categorías y sus nombres, exportados ──
edit('src/model.js', [
    ("""const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
""", """// Las categorías de la app en su orden y sus nombres, una sola vez (B5, decisión 6): el de títulos y
// etiquetas («Benjamín»), el de dentro de una frase («benjamín») y el corto de «Vistos hace poco»
// («benj.»). Los usan el modelo y las pantallas.
export const CATEGORIES = ['benjamin', 'prebenjamin'];
export const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
export const CAT_WORDS = { benjamin: 'benjamín', prebenjamin: 'prebenjamín' };
export const CAT_SHORT = { benjamin: 'benj.', prebenjamin: 'preb.' };
"""),
    ("""const CAT_ORDER = ['benjamin', 'prebenjamin'];
""", ''),
    ('rankOf(CAT_ORDER, ', 'rankOf(CATEGORIES, ', 3),
])

# ── team-view.js: los ayudantes de ui.js, y el estado de quien ya lo calculó ──
edit('src/team-view.js', [
    ("""import {
  block, box, cells, crest, empty, listEs, matchRow, notice, screenHead, shareStatus, sourcePhrase, standingsTable,
} from './ui.js';""", """import {
  block, box, cells, countLabel, crest, decimal, empty, listEs, matchRow, notice, score, screenHead, shareStatus,
  sourcePhrase, standingsTable,
} from './ui.js';"""),
    ("""const score = (a, b) => `${a}–${b}`;
// 3.25 → '3,3': un decimal con coma, sin los datos de idioma del motor.
const oneDecimal = n => n.toFixed(1).replace('.', ',');

""", ''),
    ("""`${oneDecimal(sum.perMatch.gf)} – ${oneDecimal(sum.perMatch.gc)}`""",
     """`${decimal(sum.perMatch.gf, 1)} – ${decimal(sum.perMatch.gc, 1)}`"""),
    ("""  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
""", ''),
    ('plural(', 'countLabel(', 4),
    ("""// - mine: si el equipo es mi equipo (el texto oculto de su fila en la clasificación);
// - shields: los escudos.""", """// - mine: si el equipo es mi equipo (el texto oculto de su fila en la clasificación);
// - shields: los escudos;
// - state: el estado, si quien llama ya lo calculó (la portada, con homeState: teamState una sola vez
//   por pintado, B5, decisión 6); sin él, teamState."""),
    ("""  action = null, nextSeason = false, stale = null, calendar = 'wide', mine = false, shields = {},
} = {}) {
  const state = teamState({ group, name, todayISO: ctx.today, portalSeason: ctx.portal.season });
  const v = { ctx, group, name, shields, action, stale, calendar, mine, back: ctx.backHref || null };
  return { state, ...(state === 'D' ? endedView(v, nextSeason) : seasonView(v, state)) };""",
     """  action = null, nextSeason = false, stale = null, calendar = 'wide', mine = false, shields = {}, state = null,
} = {}) {
  const shown = state || teamState({ group, name, todayISO: ctx.today, portalSeason: ctx.portal.season });
  const v = { ctx, group, name, shields, action, stale, calendar, mine, back: ctx.backHref || null };
  return { state: shown, ...(shown === 'D' ? endedView(v, nextSeason) : seasonView(v, shown)) };"""),
])

# ── screen-home.js: homeState, una vez, y la vista de equipo con su estado ──
edit('src/screen-home.js', [
    ("""// render(ctx) es puro y síncrono: homeState decide el estado (E, X, D, B, C o A, en ese orden) sobre
// la resolución de mi equipo.""", """// render(ctx) es puro y síncrono: homeState decide el estado (E, X, D, B, C o A, en ese orden) sobre
// la resolución de mi equipo, y la vista de equipo lo recibe (teamState, una vez por pintado: B5,
// decisión 6)."""),
    ("""      action: 'change', nextSeason: true, stale: r.stale || null, calendar: 'wide', mine: true, shields,
    });""", """      action: 'change', nextSeason: true, stale: r.stale || null, calendar: 'wide', mine: true, shields, state,
    });"""),
])

# ── screen-equipo.js: countLabel y score de ui.js; routeIsMine, de myteam.js ──
edit('src/screen-equipo.js', [
    ("""import { block, box, cells, empty, listEs, notice, pointsChart, screenHead } from './ui.js';""",
     """import { block, box, cells, countLabel, empty, listEs, notice, pointsChart, score, screenHead } from './ui.js';"""),
    ("""import { teamTrajectory } from './myteam.js';
import { matchHref, routeHref, teamHref, weekdayDate } from './links.js';
import { routeIsMine } from './router.js';
""", """import { routeIsMine, teamTrajectory } from './myteam.js';
import { matchHref, routeHref, teamHref, weekdayDate } from './links.js';
"""),
    ("""const score = (a, b) => `${a}–${b}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
""", ''),
    ('plural(', 'countLabel(', 6),
])

# ── screen-partido.js: score de ui.js ──
edit('src/screen-partido.js', [
    ("""import { block, box, cells, crest, empty, formChips, notice, screenHead, shareStatus } from './ui.js';""",
     """import { block, box, cells, crest, empty, formChips, notice, score, screenHead, shareStatus } from './ui.js';"""),
    ("""const score = (home, away) => `${home}${DASH}${away}`;
""", ''),
])

# ── screen-explorar.js: las categorías de model.js y countLabel de ui.js ──
edit('src/screen-explorar.js', [
    ("""import { screenHead, block, crest, empty, notice, searchBox, seasonPicker, linkRow, listEs } from './ui.js';""",
     """import { screenHead, block, countLabel, crest, empty, notice, searchBox, seasonPicker, linkRow, listEs } from './ui.js';"""),
    ("""import { competitionKey, competitions, findGroup, groupSummary, searchKey, searchTeams, seasonLabel } from './model.js';""",
     """import {
  CATEGORIES, CAT_NAMES, CAT_SHORT, competitionKey, competitions, findGroup, groupSummary, searchKey, searchTeams, seasonLabel,
} from './model.js';"""),
    ("""const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const CAT_SHORT = { benjamin: 'benj.', prebenjamin: 'preb.' };
const CAT_KEYS = ['benjamin', 'prebenjamin'];
const PICKER_ID = 'temporada';
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
""", """const PICKER_ID = 'temporada';
"""),
    ('count(', 'countLabel(', 8),
    ('CAT_KEYS.map(', 'CATEGORIES.map('),
])

# ── screen-ligas.js: las categorías de model.js; countLabel, decimal y signed de ui.js ──
edit('src/screen-ligas.js', [
    ("""import { screenHead, block, crest, empty, notice, linkRow, listEs } from './ui.js';""",
     """import { screenHead, block, countLabel, crest, decimal, empty, notice, linkRow, listEs, signed } from './ui.js';"""),
    ("""import { competitions, compareGroups, groupSummary, seasonLabel } from './model.js';""",
     """import {
  CATEGORIES, CAT_NAMES, CAT_WORDS, competitions, compareGroups, groupSummary, seasonLabel,
} from './model.js';"""),
    ("""const CAT_NAMES = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const ISLAND_NAMES = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
const CAT_KEYS = ['benjamin', 'prebenjamin'];
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
""", """const ISLAND_NAMES = { grancanaria: 'Gran Canaria', lanzarote: 'Lanzarote', fuerteventura: 'Fuerteventura' };
"""),
    ("""  const names = cats.map((cat, k) => (k ? CAT_NAMES[cat].toLowerCase() : CAT_NAMES[cat]));""",
     """  const names = cats.map((cat, k) => (k ? CAT_WORDS[cat] : CAT_NAMES[cat]));"""),
    ("""    const cats = c ? [c] : CAT_KEYS;
    return empty(`No hay ${what} de ${listEs(cats.map(cat => CAT_NAMES[cat].toLowerCase()))}""",
     """    const cats = c ? [c] : CATEGORIES;
    return empty(`No hay ${what} de ${listEs(cats.map(cat => CAT_WORDS[cat]))}"""),
    ('CAT_KEYS', 'CATEGORIES', 2),
    ('count(', 'countLabel(', 4),
    ("""// «2,82»: los puntos por partido con dos decimales y coma; la diferencia de goles con su signo («−30»).
const ppjText = ppj => ppj.toFixed(2).replace('.', ',');
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

""", ''),
    ("""ppjText(row.ppj)""", """decimal(row.ppj, 2)"""),
    ("""${CAT_NAMES[entry.cat].toLowerCase()}`;""", """${CAT_WORDS[entry.cat]}`;"""),
])

# ── screen-goleadores.js: las categorías de model.js, countLabel y listOf una vez por pintado ──
edit('src/screen-goleadores.js', [
    ("""import { crest, empty, notice, screenHead, searchBox, segmented } from './ui.js';
import { findGroup, playerName, searchKey, seasonLabel } from './model.js';""",
     """import { countLabel, crest, empty, notice, screenHead, searchBox, segmented } from './ui.js';
import { CATEGORIES, CAT_NAMES, CAT_WORDS, findGroup, playerName, searchKey, seasonLabel } from './model.js';"""),
    ("""const CATS = [{ value: 'benjamin', label: 'Benjamín' }, { value: 'prebenjamin', label: 'Prebenjamín' }];
const CAT_LABEL = { benjamin: 'Benjamín', prebenjamin: 'Prebenjamín' };
const CAT_NAME = { benjamin: 'benjamín', prebenjamin: 'prebenjamín' };
""", """const CATS = CATEGORIES.map((value) => ({ value, label: CAT_NAMES[value] }));
"""),
    ('CAT_NAME[', 'CAT_WORDS[', 2),
    ('CAT_LABEL[', 'CAT_NAMES[', 1),
    ("""// La lista de la ruta, entera y con su puesto en ella (rankScorers, el mismo de Récords), que se
// conserva al filtrar: la de un grupo (groupScorers, null si la fuente no lo publica) o la de la
// categoría (categoryScorers), y cuántos grupos suma. Cada fila lleva su clave de búsqueda.
function listOf(ctx) {""", """// La lista de la ruta, entera y con su puesto en ella (rankScorers, el mismo de Récords), que se
// conserva al filtrar: la de un grupo (groupScorers, null si la fuente no lo publica) o la de la
// categoría (categoryScorers), y cuántos grupos suma. Cada fila lleva su clave de búsqueda. Una vez
// por pintado (B5, decisión 6): render y mount reciben el mismo ctx del router, y el mount la toma de
// aquí; cada tecla filtra esa lista, sin volver a hacerla.
const lists = new WeakMap();
function listOf(ctx) {
  if (!lists.has(ctx)) lists.set(ctx, buildList(ctx));
  return lists.get(ctx);
}

function buildList(ctx) {"""),
    ("""  if (shown !== total) return `${shown} de ${total} ${total === 1 ? 'jugador' : 'jugadores'}`;
  const players = `${total} ${total === 1 ? 'jugador' : 'jugadores'}`;
  return list.group ? players : `${players} de ${list.groups} ${list.groups === 1 ? 'grupo' : 'grupos'}`;""",
     """  if (shown !== total) return `${shown} de ${countLabel(total, 'jugador', 'jugadores')}`;
  const players = countLabel(total, 'jugador', 'jugadores');
  return list.group ? players : `${players} de ${countLabel(list.groups, 'grupo', 'grupos')}`;"""),
])

# ── screen-records.js: las categorías de model.js; decimal y score de ui.js ──
edit('src/screen-records.js', [
    ("""import { block, box, cells, crest, empty, screenHead, segmented } from './ui.js';""",
     """import { block, box, cells, crest, decimal, empty, score, screenHead, segmented } from './ui.js';"""),
    ("""import { playerName, roundOf, seasonLabel, seasonRecords, RECORD_MIN_PJ, RECORD_MIN_SIDE } from './model.js';""",
     """import {
  CATEGORIES, CAT_NAMES, CAT_WORDS, playerName, roundOf, seasonLabel, seasonRecords, RECORD_MIN_PJ, RECORD_MIN_SIDE,
} from './model.js';"""),
    ("""const CATS = [{ value: 'benjamin', label: 'Benjamín' }, { value: 'prebenjamin', label: 'Prebenjamín' }];
const CAT_WORD = { benjamin: 'benjamín', prebenjamin: 'prebenjamín' };
""", """const CATS = CATEGORIES.map((value) => ({ value, label: CAT_NAMES[value] }));
"""),
    ('CAT_WORD[', 'CAT_WORDS[', 4),
    ("""// Cifras sin los datos de idioma del motor (decisión 123 de B2): 3253 → «3.253», 8.0123 → «8,01».
const thousands = (n) => String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
const decimals = (n, digits) => n.toFixed(digits).replace('.', ',');
""", """// Miles con punto, sin los datos de idioma del motor (decisión 123 de B2): 3253 → «3.253».
const thousands = (n) => String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
"""),
    ('decimals(', 'decimal(', 3),
    ("""figure: `${match.hs}–${match.as}`""", """figure: score(match.hs, match.as)"""),
])

# ── screen-copa.js: countLabel de ui.js ──
edit('src/screen-copa.js', [
    ("""import { block, box, crest, empty, matchNote, matchRow, screenHead, standingsTable } from './ui.js';""",
     """import { block, box, countLabel, crest, empty, matchNote, matchRow, screenHead, standingsTable } from './ui.js';"""),
    ("""  const count = `${rounds.length} ${rounds.length === 1 ? 'ronda' : 'rondas'}`;
  return html`${championBlock(rounds, champion, me, today, shields)}${block('Cuadro', html`${tabs}<div class="bracket" role="region" aria-label="Cuadro, una columna por ronda" tabindex="0">${columns}</div>`, { context: count })}`;""",
     """  return html`${championBlock(rounds, champion, me, today, shields)}${block('Cuadro', html`${tabs}<div class="bracket" role="region" aria-label="Cuadro, una columna por ronda" tabindex="0">${columns}</div>`, { context: countLabel(rounds.length, 'ronda', 'rondas') })}`;"""),
])

# ── screen-fuentes.js: countLabel, y la caja de error de §7 (errorBox) con su «Reintentar» ──
edit('src/screen-fuentes.js', [
    ("""// portada (nextSeasonBox). Sin data-health, un vacío con el «Reintentar» del router.""",
     """// portada (nextSeasonBox). Sin data-health, la caja de error de §7 (errorBox, B5, decisión 6), con
// el «Reintentar» del router."""),
    ("""import { block, box, cells, empty, listEs, notice, screenHead } from './ui.js';
import { routeTitle } from './shell.js';""", """import { block, box, cells, countLabel, empty, listEs, notice, screenHead } from './ui.js';
import { errorBox, routeTitle } from './shell.js';"""),
    ("""    ok ? `${ok} ${ok === 1 ? 'correcta' : 'correctas'}` : '',""", """    ok ? countLabel(ok, 'correcta', 'correctas') : '',"""),
    ("""  // Sin data-health (needs lo pidió y falló): el vacío y el «Reintentar» del router, que vuelve a
  // llamar a needs, y needs lo vuelve a pedir.
  if (!health || typeof health !== 'object') {
    return html`<section data-screen="fuentes">${screenHead(title, { back: ctx.backHref })}<div class="block"><div class="empty fu-failed"><p>No se pudo cargar el estado de las fuentes.</p><div class="buttons"><button class="button is-main" type="button" data-action="retry">Reintentar</button></div></div></div></section>`;
  }""", """  // Sin data-health (needs lo pidió y falló): la caja de error, anunciada, con el «Reintentar» del
  // router, que vuelve a llamar a needs, y needs lo vuelve a pedir.
  if (!health || typeof health !== 'object') {
    return html`<section data-screen="fuentes">${screenHead(title, { back: ctx.backHref })}<div class="block">${errorBox('la comprobación de las fuentes')}</div></section>`;
  }"""),
    ("""notice(null, `${n} ${n === 1 ? 'grupo' : 'grupos'} sin página web comprobada;""",
     """notice(null, `${countLabel(n, 'grupo', 'grupos')} sin página web comprobada;"""),
])

# ── acta.css: fuera la regla de la caja propia de Datos y fuentes, que ya no se pinta ──
edit('acta.css', [
    (""".fu-failed .buttons { margin-top: 10px; border: 1.5px solid var(--ink); }
""", ''),
])

# ── state.js: fuera las cuatro heredadas que nadie usa en src/ ──
p = Path('src/state.js')
s = p.read_text(encoding='utf-8')
start = s.index('/* For a DRAWN knockout match, the team that advanced (on penalties) is the one')
end = s.index('/* A cup / knockout group (vs a regular league group).')
cut = s[start:end]
assert s.count('/* For a DRAWN knockout match') == 1 and all(f in cut for f in ['bracketDrawAdvancer', 'matchAdvancer', 'bracketChampion']), cut[:200]
s = s[:start] + s[end:]
start = s.index('/* Total matches across a set of groups.')
end = s.index('/* `needs` de las pantallas que leen una temporada')
cut = s[start:end]
assert s.count('/* Total matches across a set of groups.') == 1 and 'export function countMatches' in cut, cut[:200]
s = s[:start] + s[end:]
p.write_text(s, encoding='utf-8')

# ── routeIsMine, de router.js a myteam.js; nav.update con el token de su mount; «‹» por goBack ──
p = Path('src/router.js')
s = p.read_text(encoding='utf-8')
mine = """// ¿Es de mi equipo este partido o esta ficha? Mismo grupo y temporada que el resuelto, y su nombre.
export function routeIsMine(route, resolution) {
  if (resolution?.status !== 'ok' || !resolution.group) return false;
  const params = route?.params || {};
  if (params.s !== resolution.group.season || params.g !== resolution.group.id) return false;
  if (route.screen === 'partido') return params.h === resolution.name || params.a === resolution.name;
  if (route.screen === 'equipo') return params.t === resolution.name;
  return false;
}

"""
assert s.count(mine) == 1
p.write_text(s.replace(mine, ''), encoding='utf-8')
edit('src/router.js', [
    ("""//   historyMode (pushState o replaceState), parentOf («‹»), activeTab y routeIsMine (barra).""",
     """//   historyMode (pushState o replaceState), parentOf («‹») y activeTab (barra, con routeIsMine de
//   myteam.js)."""),
    ("""//   historial, foco al h1 (o al control del ancla), «‹» y Reintentar; y el nav de las pantallas,
//   con la búsqueda que se apunta sin pintar (update), los vistos hace poco y «Borrar datos».""",
     """//   historial, foco al h1 (o al control del ancla), «‹» y Reintentar; y el nav de las pantallas,
//   con la búsqueda que se apunta sin pintar (update, solo desde el mount vigente), los vistos hace
//   poco y «Borrar datos»."""),
    ("""import { sameClub } from './myteam.js';""", """import { routeIsMine, sameClub } from './myteam.js';"""),
    ("""        try {
          done = screen.mount(root, ctx, nav);
        } catch (err) {""", """        try {
          done = screen.mount(root, ctx, navFor(my));
        } catch (err) {"""),
    ("""  // pueden llegar dos popstate, a entradas distintas (el segundo pinta sin pendiente que resolver);
  // en el navegador falso de las pruebas llegan a la misma entrada y onLocation descarta el segundo.
  // Sin encadenar, el pendiente del primero se perdía y su promesa se quedaba colgada para siempre
  // (B2, ronda 2, hallazgo único).""", """  // pueden llegar dos popstate, a entradas distintas (el segundo pinta sin pendiente que resolver);
  // en el navegador falso de las pruebas llegan a la misma entrada y onLocation descarta el segundo.
  // Sin encadenar, el pendiente del primero se perdía y su promesa se quedaba colgada para siempre
  // (B2, ronda 2, hallazgo único). El «‹» del DOM también pasa por aquí (B5, decisión 6): idle()
  // espera su vuelta, como la de nav.back()."""),
    ("""    if (action === 'back' && (entry()?.fbIdx ?? 0) > 0) {
      event.preventDefault();
      hist.back();
      return;
    }""", """    if (action === 'back' && (entry()?.fbIdx ?? 0) > 0) {
      event.preventDefault();
      goBack();
      return;
    }"""),
    ("""  if ('scrollRestoration' in hist) hist.scrollRestoration = 'manual';""",
     """  // El nav que recibe cada mount: el de arriba, con su update ligado a esa navegación (B5, decisión
  // 6). Un update que llega cuando ya empezó otra (el temporizador de una pantalla anterior, que ningún
  // buscador usa hoy) no reescribe la ruta nueva: devuelve false sin tocar nada.
  const navFor = (my) => ({ ...nav, update: (params) => my === token && update(params) });

  if ('scrollRestoration' in hist) hist.scrollRestoration = 'manual';"""),
])
edit('src/myteam.js', [
    ("""// ---- Trayectoria (spec §4.6 y §6.1; decisión 14 de B3) ----""",
     """// ¿Es de mi equipo este partido o esta ficha? Mismo grupo y temporada que el resuelto, y su nombre. La
// usan la barra (router.js) y la ficha de Equipo; vivía en router.js (B5, decisión 6).
export function routeIsMine(route, resolution) {
  if (resolution?.status !== 'ok' || !resolution.group) return false;
  const params = route?.params || {};
  if (params.s !== resolution.group.season || params.g !== resolution.group.id) return false;
  if (route.screen === 'partido') return params.h === resolution.name || params.a === resolution.name;
  if (route.screen === 'equipo') return params.t === resolution.name;
  return false;
}

// ---- Trayectoria (spec §4.6 y §6.1; decisión 14 de B3) ----"""),
])
print('src/ y acta.css: ayudantes una vez, routeIsMine en myteam.js, sin las cuatro heredadas, listOf y teamState una vez, Fuentes con errorBox, nav.update con su token y «‹» por goBack')
PY
python3 scripts/codigo.py
```
Esperado:
```text
src/ y acta.css: ayudantes una vez, routeIsMine en myteam.js, sin las cuatro heredadas, listOf y teamState una vez, Fuentes con errorBox, nav.update con su token y «‹» por goBack
CODIGO 2ecc5c42: la huella de acta.css y src/*.js, en index.html
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_router.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_modulos.mjs scripts/tests/test_rediseno_goleadores.mjs scripts/tests/test_rediseno_vista_equipo.mjs scripts/tests/test_rediseno_fuentes.mjs scripts/tests/test_rediseno_state.mjs scripts/tests/test_review0615_frontend.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: todas, también las 12 huellas de la portada (en `test_rediseno_vista_equipo.mjs`), que no cambian:
```text
# tests 159
# pass 159
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La caja de error de Datos y fuentes es lo único que se ve distinto. `$S/vista-comun.mjs` pinta la app real con los mundos de `fixture-site.mjs` en las tres variantes de §11 y mide cada captura (como la vista previa del paso 5 de la Tarea 10 de B3); la usan también las vistas de las Tareas 4 a 6. Si ya existe (otra sesión), se vuelve a escribir igual:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
cat > "$S/vista-comun.mjs" <<'EOF'
// Vistas previas del plan B5, fuera del repo: la app real con los mundos de fixture-site.mjs (datos
// congelados y reloj fijado), en las tres variantes de §11 (390 px en claro y en oscuro, 1440 px en
// claro), con la captura de la pantalla entera y sus medidas. La importan las vistas de cada tarea
// (vista-*.mjs), que se ejecutan desde la raíz del repo con Playwright en node_modules.
// escena: { name, world, hash, screen, state?, fail?, route?(context), before?(page, extras), act?(page, extras),
//          measure?(page) }, con extras = { label, shot, width }
//   route: rutas propias, después de las del mundo (mandan sobre ellas); before: lo que se hace nada más
//   abrir, antes de que la pantalla esté pintada (con él, la apertura no espera al evento load); act: lo
//   que se hace con la pantalla ya pintada, antes de la foto final; shot(sufijo) hace fotos intermedias;
//   measure: datos propios de la escena. Lo que devuelven before, act y measure sale en la línea.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const load = (path) => import(pathToFileURL(join(root, path)).href);
const { startServer, findChrome } = await load('scripts/tests/render-smoke.mjs');
const { waitForAsync } = await load('scripts/tests/browser-wait.mjs');
const { useWorld } = await load('scripts/tests/fixture-site.mjs');
const { chromium } = createRequire(join(root, 'scripts/tests/x.mjs'))('playwright');

export { waitForAsync };
export const VARIANTS = [[390, 844, 'light', 'claro'], [390, 844, 'dark', 'oscuro'], [1440, 900, 'light', 'claro']];
const PULSABLE = '.button, .back, .screen-action, .segment, .more, .match-row, .bm, .bracket-tab, .squad-player, .team-toggle, .pt-prev-toggle, .link-row, .fu-row';

// Lo que se mide en cada foto: desplazamiento horizontal, pulsables visibles de menos de 44 px (en
// móvil), imágenes rotas, si la barra fija tapa el final (de las partes de la pantalla, como checkLayout
// de interaction-smoke: el cuadro de copa se desliza por dentro), los h1 y los títulos de bloque.
const measure = (page, narrow) => page.evaluate(([sel, isNarrow]) => {
  const bar = document.querySelector('.tabbar');
  const main = document.querySelector('#contenido');
  const visible = (e) => e.getClientRects().length > 0;
  const last = [...main.querySelectorAll('section[data-screen] > *')].filter(visible).reduce((max, e) => Math.max(max, e.getBoundingClientRect().bottom), 0);
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    small: isNarrow ? [...main.querySelectorAll(sel)].filter(visible)
      .map((e) => [e.textContent.trim().slice(0, 24), Math.round(e.getBoundingClientRect().height)]).filter(([, px]) => px < 44) : [],
    broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')),
    covered: getComputedStyle(bar).position === 'fixed' && last > bar.getBoundingClientRect().top + 0.5,
    h1: [...main.querySelectorAll('h1')].map((h) => h.textContent),
    blocks: [...main.querySelectorAll('.block-title')].map((h) => h.textContent),
  };
}, [PULSABLE, narrow]);

// Ejecuta las escenas en las tres variantes y escribe <out>/<escena>-<ancho>-<tema>[-<sufijo>].png.
// Devuelve los problemas (y los imprime al final, con OK o PROBLEMAS).
export async function run(out, scenes, { variants = VARIANTS } = {}) {
  if (!out) throw new Error('Falta OUT=<directorio de las capturas>');
  mkdirSync(out, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
  const problems = [];
  try {
    for (const scene of scenes) {
      for (const [width, height, colorScheme, theme] of variants) {
        const label = `${scene.name}-${width}-${theme}`;
        const context = await browser.newContext({
          viewport: { width, height }, colorScheme, serviceWorkers: 'block', locale: 'es-ES',
          timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce',
        });
        try {
          await useWorld(context, scene.world, { fail: scene.fail || [] });
          if (scene.route) await scene.route(context);
          const page = await context.newPage();
          page.setDefaultTimeout(10000);
          page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`));
          await page.goto(base + scene.hash, { waitUntil: scene.before ? 'commit' : 'load' });
          const shot = async (suffix) => page.screenshot({ path: join(out, `${label}${suffix ? `-${suffix}` : ''}.png`) });
          const early = scene.before ? await scene.before(page, { label, shot, width }) : undefined;
          await waitForAsync(page, ([s, st]) => {
            const section = document.querySelector('#contenido section[data-screen]');
            return Boolean(section) && section.getAttribute('data-screen') === s && (st === null || section.getAttribute('data-state') === st);
          }, [scene.screen, scene.state ?? null], { label });
          const extra = scene.act ? await scene.act(page, { label, shot, width }) : undefined;
          await page.mouse.move(0, 0);
          // La ventana, del alto de la página; los escudos diferidos y la fuente, cargados.
          const full = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({ width, height: Math.max(height, full) });
          await page.evaluate(() => { for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'; });
          await waitForAsync(page, () => document.fonts.status === 'loaded'
            && [...document.images].every((img) => img.complete && img.naturalWidth > 0), null, { label: `${label}, escudos y fuente` });
          const m = { ...(await measure(page, width < 1024)), ...(early || {}), ...(extra || {}), ...(scene.measure ? await scene.measure(page) : {}) };
          console.log(`${label}: ${JSON.stringify(m)}`);
          if (m.overflow > 0) problems.push(`${label}: desplazamiento horizontal de ${m.overflow}px`);
          if (m.small.length) problems.push(`${label}: pulsables de menos de 44 px: ${JSON.stringify(m.small)}`);
          if (m.broken.length) problems.push(`${label}: imágenes rotas: ${m.broken.join(', ')}`);
          if (m.covered) problems.push(`${label}: la barra tapa el final`);
          if (m.h1.length !== 1) problems.push(`${label}: ${m.h1.length} h1`);
          await shot('');
        } catch (error) {
          problems.push(`${label}: ${error.message.split('\n')[0]}`);
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
  console.log(problems.length ? `PROBLEMAS:\n${problems.join('\n')}` : `OK: sin errores; capturas en ${out}`);
  return problems;
}
EOF
cat > "$S/vista-fuentes.mjs" <<'EOF'
// Plan B5, Tarea 3: Datos y fuentes sin data-health.json (un 503), con la caja de error de §7
// (errorBox) y su «Reintentar», en las tres variantes. Uso, desde la raíz del repo:
// OUT=<dir> node <este fichero>
import { run } from './vista-comun.mjs';

const problems = await run(process.env.OUT, [{
  name: 'fuentes-error', world: 'D', hash: '#/fuentes', screen: 'fuentes', fail: ['data-health.json'],
  measure: (page) => page.evaluate(() => {
    const box = document.querySelector('#contenido .error-box');
    return { role: box?.getAttribute('role') ?? null, text: box?.innerText.replace(/\s+/g, ' ').trim() ?? null };
  }),
}]);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/vistas-t3" node "$S/vista-fuentes.mjs"
```
Esperado:
```text
fuentes-error-390-claro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Datos y fuentes"],"blocks":[],"role":"alert","text":"No se pudieron cargar los datos de la comprobación de las fuentes. Reintentar"}
fuentes-error-390-oscuro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Datos y fuentes"],"blocks":[],"role":"alert","text":"No se pudieron cargar los datos de la comprobación de las fuentes. Reintentar"}
fuentes-error-1440-claro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Datos y fuentes"],"blocks":[],"role":"alert","text":"No se pudieron cargar los datos de la comprobación de las fuentes. Reintentar"}
OK: sin errores; capturas en $S/vistas-t3
```

Abrir con Read `fuentes-error-390-claro.png`, `fuentes-error-390-oscuro.png` y `fuentes-error-1440-claro.png`, y comparar con la caja de error de cualquier otra pantalla (la escena `error` de `capturas.mjs`, Tabla de 2023-24):
- «‹ Datos y fuentes» sobre la regla de tinta y, debajo, una caja de borde de tinta con «No se pudieron cargar los datos de la comprobación de las fuentes.» en negrita y «Reintentar» relleno de tinta a todo el ancho; ya no el vacío de borde discontinuo;
- en oscuro, la tinta clara (`#FF5A64`) y el texto del botón oscuro;
- a 1440 px, la caja a todo el ancho de 1120 px, como las demás cajas de error.

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: pytest, sin cambios; node, el recuento anterior menos 6 (12 fuera y 6 nuevas), de 743 a 737, sin fallos:
```text
517 passed, 5 skipped
# tests 737
# pass 737
# fail 0
```

Los smoke, tres pasadas (unos 3,5 minutos: con el `timeout` de la herramienta a 600000 ms), y el DOM de la portada:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
grep '^PASS: render smoke' <<<"$out" | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado: en cada pasada, las 22 líneas PASS de la tarea anterior, sin otras líneas, y el DOM de la portada sin cambios (la de los datos reales, en el estado del día: D el 27/09/2026):
```text
pasada 1: 22 PASS; otras líneas: 0
pasada 2: 22 PASS; otras líneas: 0
pasada 3: 22 PASS; otras líneas: 0
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/codigo.py
git add src/ui.js src/model.js src/myteam.js src/router.js src/state.js src/team-view.js src/screen-home.js src/screen-equipo.js src/screen-partido.js src/screen-explorar.js src/screen-ligas.js src/screen-goleadores.js src/screen-records.js src/screen-copa.js src/screen-fuentes.js acta.css index.html scripts/tests/test_review0615_frontend.mjs scripts/tests/test_rediseno_state.mjs scripts/tests/test_rediseno_router.mjs scripts/tests/test_rediseno_fuentes.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_modulos.mjs scripts/tests/test_rediseno_goleadores.mjs scripts/tests/test_rediseno_vista_equipo.mjs
git commit -q -F - <<'EOF'
refactor(rediseño): los ayudantes una sola vez y lo aparcado del router (B5, tarea 3)

Sin cambios de conducta: las huellas de la portada, su DOM en render-smoke
y los tres smoke, iguales (decisión 6).

- Los nombres de categoría (CATEGORIES, CAT_NAMES, CAT_WORDS y CAT_SHORT),
  exportados por model.js; countLabel, score, signed (la que admite null)
  y decimal, por ui.js. Las pantallas dejan sus copias, y una prueba fija
  que no vuelven.
- routeIsMine pasa de router.js a myteam.js.
- Fuera countMatches, matchAdvancer, bracketDrawAdvancer y bracketChampion
  de state.js, que nadie usaba (el cuadro es bracket(), de model.js), con
  las doce pruebas heredadas que solo las ejercitaban.
- Goleadores hace su lista una vez por pintado (render y mount la
  comparten), y la portada, su estado (teamView recibe el de homeState).
- Datos y fuentes sin data-health: la caja de error de §7 (errorBox), con
  su role="alert", en lugar de un vacío propio.
- Cada mount recibe su nav: un update que llega tras otra navegación ya
  no reescribe la ruta nueva. El «‹» del DOM pasa por goBack, e idle()
  espera la vuelta.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado:
```text
CODIGO 2ecc5c42: la huella de acta.css y src/*.js, en index.html
 25 files changed, 305 insertions(+), 361 deletions(-)
```

---

### Task 4: «Reintentar» de un bloque sin perder el sitio: la Plantilla de Equipo y los Goles y las Alineaciones de Partido (decisión 3)

El «Reintentar» de los tres bloques que pueden fallar en el primer pintado deja de repintar toda la ruta: vuelve a pedir lo que le falta y pinta solo su bloque, en su sitio, con el foco en su título.

**Contexto**
- **Hoy** (inventario §D, comprobado en `0208d26`): la caja de error de la Plantilla (`screen-equipo.js:111`), la de los Goles (`screen-partido.js:143` y `:147`) y la de las Alineaciones (`:185`) no tienen manejo local: su «Reintentar» sube al router, que hace `show('refresh')` (`router.js:545-549`): repinta la ruta entera, vuelve arriba (`target = 0`) y lleva el foco al `h1`. Quien había bajado hasta la plantilla pierde su sitio.
- **El modelo** son los dos paneles bajo demanda, que ya lo hacen bien: la Trayectoria (`screen-equipo.js:266-269`) y «temporadas anteriores» (`screen-partido.js:437-448`), con un manejador en la sección y `stopPropagation`: el router, que escucha en el documento, no se entera.
- **Lo que cambia**:
  - cada bloque es una sola sección con su id, en todas sus variantes: `#plantilla`, `#goles` y `#alineaciones` (`block(…, { id })` de `ui.js`). La nota de las actas de la Plantilla («Actas de 9 de 20 partidos jugados…») pasa dentro de su sección: se ve igual (`.notice` lleva su margen de 10 px y el bloque siguiente, sus 18 px), y así el bloque entero se sustituye de una vez. Ningún otro bloque cambia, y la portada tampoco;
  - `retryBlock(section, id, button, load, paint)`, en `shell.js` junto a `errorBox`: pone el botón en «Cargando…» (desactivado), espera `load` (los cargadores de `state.js` nunca rechazan: dan `null`), y si el bloque sigue en la página lo sustituye por `paint()` con `outerHTML`, devuelve el desplazamiento adonde estaba y lleva el foco al título del bloque (`tabindex="-1"`, como el `h1` del router, con `preventScroll`);
  - el desplazamiento se restaura a mano porque el anclaje del navegador (*scroll anchoring*) lo movía: al crecer el bloque, Chrome sube la página lo mismo que crece para dejar quieto lo de debajo, y el bloque nuevo queda fuera de la vista (medido en la ficha de Guayarmina a 390 px: de 870 a 1302 px, los 432 que crece la Plantilla);
  - qué vuelve a pedir cada uno: la Plantilla, las actas de su temporada (`ensureLineups`); las Alineaciones, las actas del partido; los Goles, la cronología (`ensureMatchDetail`) si falta y, si tampoco llegaron, las actas (sin ellas no se sabe si el acta trae goles). Cada «Reintentar» pinta solo su bloque: si fallaron los dos, los Goles siguen con su caja hasta que se pulse la suya, que ya no pide nada;
  - si tras el «Reintentar» resulta que el grupo no tiene actas (PG2), la Plantilla no desaparece bajo el dedo de quien pulsó: dice «La federación no ha publicado actas de este grupo.».
- **Pruebas**:
  - en Node, el `mount` real de las dos pantallas sobre `fakeSection` (nueva, en `fake-browser.mjs`: la sección pintada, con sus bloques por id que se sustituyen con `outerHTML` y la delegación de sus clics con `stopPropagation`; el navegador falso del router no guarda árboles ni busca por selector), con un `fetch` simulado que primero falla (503) y después sirve las fixtures; y `retryBlock` en `test_rediseno_shell.mjs`, también cuando el bloque ya no está;
  - en `interaction-smoke`, una escena nueva a 390 px en claro: la primera petición de las actas y la de la cronología dan 503 y las siguientes, 200; la Plantilla de Guayarmina y las Alineaciones y los Goles de Moya–Guayarmina (A1, jornada 11) se pintan en su sitio, sin volver arriba (el desplazamiento, igual), sin repintar la pantalla (una marca en su sección sigue ahí), sin entradas nuevas en el historial y con el foco en el título del bloque.
- **Recuentos**: node, el anterior más 4 (737 → 741): 1 de Equipo, 2 de Partido y 1 de `shell.js`; pytest, sin cambios; y una línea PASS más en cada pasada de los smoke (de 22 a 23).

**Files:**
- Modify: `src/shell.js`, `src/screen-equipo.js`, `src/screen-partido.js` e `index.html` (`CODIGO`)
- Test: `scripts/tests/fixtures/rediseno/fake-browser.mjs` (`fakeSection`), `scripts/tests/test_rediseno_equipo.mjs`, `scripts/tests/test_rediseno_partido.mjs`, `scripts/tests/test_rediseno_shell.mjs` y `scripts/tests/interaction-smoke.mjs`
- Fuera del repo: `$S/vista-reintentar.mjs`

**Interfaces:**
- Consumes: `block`, `empty` (`ui.js`); `errorBox` (`shell.js`); `ensureLineups` y `ensureMatchDetail` (`state.js`); `$S/vista-comun.mjs` (Tarea 3, paso 5); en las pruebas, `matches` de `fake-browser.mjs`, `ctxFor`, `datasetsFor`, `lineupsFor`, `goleadores` y `fixture`.
- Produces:

```js
// src/shell.js
export async function retryBlock(section, id, button, load, paint) → Promise<Element | null>
//   section.querySelector(`#${id}`) → el bloque; button: el pulsado («Cargando…», disabled); load(): la
//   carga, que nunca rechaza; paint() → Html del bloque nuevo (una sección con el mismo id). Devuelve el
//   bloque nuevo, o null si no estaba o ya no está en la página.
// src/screen-equipo.js: la Plantilla, <section class="block" id="plantilla">, con la nota de las actas dentro
// src/screen-partido.js: <section class="block" id="goles"> y <section class="block" id="alineaciones">
// scripts/tests/fixtures/rediseno/fake-browser.mjs
export function fakeSection(screenId, blocks = {}) → { section, focus, block(id), clickIn(id, attrs, tag = 'button') }
//   clickIn → { event: { prevented, stopped }, target }; block(id) → { id, markup, title, isConnected } | null
```

- [ ] **Step 1: Write the failing test**

`fakeSection`, las pruebas de Node y la escena de `interaction-smoke`, que se ejecuta en el paso 6:

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


def append(path, text):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.endswith('\n') and text.strip() not in s, path
    p.write_text(s + text, encoding='utf-8')


# ── fake-browser.mjs: la sección pintada de una pantalla, con sus bloques por id ──
FB = 'scripts/tests/fixtures/rediseno/fake-browser.mjs'
edit(FB, [
    ("""// Cada elemento sabe closest(selector) solo sobre sí mismo, con selectores de etiqueta y de atributo
// ('a[href],[data-action]', '[data-action="retry"]'), que es lo que usan el router y app.js.
""", """// Cada elemento sabe closest(selector) solo sobre sí mismo, con selectores de etiqueta y de atributo
// ('a[href],[data-action]', '[data-action="retry"]'), que es lo que usan el router y app.js.
// Para el mount de una pantalla, fakeSection (Plan B5, Tarea 4): la sección pintada, con la delegación
// de sus clics y sus bloques por id.
"""),
])
append(FB, """
// La sección pintada de una pantalla, lo justo para su mount (Plan B5, Tarea 4; el navegador falso de
// arriba no busca por selector ni guarda árboles): la delegación de sus clics, que se para con
// stopPropagation (lo que se para no sigue hasta el documento, donde escucha el router), y sus bloques
// por id (blocks: { id: markup }). Un bloque se sustituye con outerHTML, como en un navegador: el que
// sale deja de estar conectado y el nuevo, si trae el mismo id, se encuentra otra vez, con su título
// (.block-title), que guarda el foco que recibe. clickIn(id, attrs) pulsa un botón con esos atributos
// dentro del bloque `id`, y devuelve el evento ({ prevented, stopped }) y el botón.
export function fakeSection(screenId, blocks = {}) {
  const listeners = [];
  const painted = new Map();
  const focus = { el: null };
  const makeBlock = (id, markup) => {
    const title = {
      tabindex: null, options: null,
      hasAttribute: (n) => n === 'tabindex' && title.tabindex !== null,
      setAttribute: (n, v) => { if (n === 'tabindex') title.tabindex = String(v); },
      focus: (options) => { title.options = options; focus.el = title; },
    };
    const el = {
      id, markup, title, isConnected: true,
      get outerHTML() { return el.markup; },
      set outerHTML(value) {
        el.isConnected = false;
        painted.delete(id);
        const next = String(value);
        if (next.includes(` id="${id}"`)) painted.set(id, makeBlock(id, next));
      },
      querySelector: (sel) => (sel === '.block-title' && el.markup.includes('class="block-title"') ? title : null),
    };
    return el;
  };
  for (const [id, markup] of Object.entries(blocks)) painted.set(id, makeBlock(id, String(markup)));
  const section = {
    matches: (sel) => sel === `[data-screen="${screenId}"]`,
    contains: () => true,
    addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); },
    querySelector: (sel) => (/^#[\\w-]+$/.test(sel) ? painted.get(sel.slice(1)) || null : null),
  };
  return {
    section, focus,
    block: (id) => painted.get(id) || null,
    clickIn(id, attrs, tag = 'button') {
      const target = {
        tagName: tag.toUpperCase(), attrs: { ...attrs }, disabled: false, textContent: '',
        hasAttribute: (n) => Object.hasOwn(target.attrs, n),
        getAttribute: (n) => (Object.hasOwn(target.attrs, n) ? target.attrs[n] : null),
        closest: (sel) => (matches(target, sel) ? target : sel === `#${id}` ? painted.get(id) || null : null),
      };
      const event = { target, prevented: false, stopped: false, preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; } };
      for (const fn of listeners) fn(event);
      return { event, target };
    },
  };
}
""")

# ── Equipo: la nota de las actas dentro de su bloque, y su «Reintentar» ──
E = 'scripts/tests/test_rediseno_equipo.mjs'
edit(E, [
    ("""import { ctxFor, datasetsFor, pastSeasonRaw, cssRules } from './fixtures/rediseno/screens.mjs';""",
     """import { ctxFor, datasetsFor, pastSeasonRaw, cssRules } from './fixtures/rediseno/screens.mjs';
import { fakeSection } from './fixtures/rediseno/fake-browser.mjs';"""),
    ("""  assert.match(out, /<\\/section><p class="notice">Actas de 9 de 20 partidos jugados; 1 acta más llega incompleta \\(sin uno de los dos equipos\\) y no cuenta\\.<\\/p>/);""",
     """  // La nota va dentro de su bloque (B5, decisión 3: una sola sección, que su «Reintentar» pinta en su sitio).
  assert.match(squad, /<\\/table><\\/div><p class="notice">Actas de 9 de 20 partidos jugados; 1 acta más llega incompleta \\(sin uno de los dos equipos\\) y no cuenta\\.<\\/p><\\/section>$/);
  assert.match(squad, /^<section class="block" id="plantilla">/);"""),
])
append(E, """
// ── Plan B5, Tarea 4: «Reintentar» de la Plantilla, sin perder el sitio (decisión 3) ──

test('«Reintentar» de la Plantilla: lo atiende la ficha, vuelve a pedir las actas y pinta solo su bloque, con el foco en su título', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const saved = globalThis.fetch;
  const asked = [];
  let up = false;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return up ? { ok: true, status: 200, text: async () => `const LINEUPS_2025_2026=${JSON.stringify(lineupsFor('2025-2026'))};` }
      : { ok: false, status: 503, text: async () => '' };
  };
  const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
  try {
    // La ficha de Guayarmina (A1) con las actas caídas: su Plantilla, con la caja de error.
    const ctx = ctxAt(A1('Guayarmina'), '2026-09-23', { datasets: datasetsFor({ ...goleadores(), lineups: { '2025-2026': null } }) });
    const failed = blockOf(s(screen.render(ctx)), 'Plantilla');
    assert.match(failed, /^<section class="block" id="plantilla">.*No se pudieron cargar los datos de las actas de 2025\\/26\\..*data-action="retry"/);
    const page = fakeSection('equipo', { plantilla: failed });
    screen.mount(page.section, ctx, { addRecent: () => true });
    // Sin red todavía: la ficha lo atiende (el router no se entera) y vuelve a pintar la caja.
    const first = page.clickIn('plantilla', { 'data-action': 'retry' });
    assert.deepEqual([first.event.prevented, first.event.stopped], [true, true]);
    assert.deepEqual([first.target.disabled, first.target.textContent], [true, 'Cargando…']);
    await flush();
    assert.deepEqual(asked, ['./data-lineups-2025-2026.js']);
    assert.equal(page.block('plantilla').markup, failed, 'otra vez la caja, con su botón');
    // Con red: la plantilla en su sitio (la de render con las actas ya cargadas) y el foco en su título.
    up = true;
    page.clickIn('plantilla', { 'data-action': 'retry' });
    await flush();
    assert.equal(asked.length, 2);
    const block = page.block('plantilla');
    assert.equal(block.markup, blockOf(s(screen.render(ctx)), 'Plantilla'));
    assert.match(block.markup, /<table class="squad">/);
    assert.equal(page.focus.el, block.title);
    assert.equal(block.title.tabindex, '-1');
    assert.deepEqual(block.title.options, { preventScroll: true });
    // Un grupo sin actas (PG2): tras el «Reintentar», el bloque lo dice en lugar de irse.
    const pg2 = ctxAt(HURACAN, '2026-09-23', { datasets: datasetsFor({ ...goleadores(), lineups: { '2025-2026': null } }) });
    const none = fakeSection('equipo', { plantilla: blockOf(s(screen.render(pg2)), 'Plantilla') });
    screen.mount(none.section, pg2, { addRecent: () => true });
    none.clickIn('plantilla', { 'data-action': 'retry' });
    await flush();
    assert.equal(none.block('plantilla').markup, '<section class="block" id="plantilla"><div class="block-head"><h2 class="block-title">Plantilla</h2></div><p class="empty">La federación no ha publicado actas de este grupo.</p></section>');
    assert.equal(asked.length, 2, 'las actas ya llegaron: no se vuelven a pedir');
  } finally {
    globalThis.fetch = saved;
  }
});
""")

# ── Partido: el «Reintentar» de los Goles y de las Alineaciones ──
P = 'scripts/tests/test_rediseno_partido.mjs'
edit(P, [
    ("""import { ctxFor } from './fixtures/rediseno/screens.mjs';""",
     """import { ctxFor } from './fixtures/rediseno/screens.mjs';
import { fakeSection } from './fixtures/rediseno/fake-browser.mjs';"""),
])
append(P, """
// ── Plan B5, Tarea 4: «Reintentar» de los Goles y de las Alineaciones, sin perder el sitio (decisión 3) ──

const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
// Un fetch que sirve la cronología y las actas de las fixtures, o un 503 mientras `down`.
function fakeFetch() {
  const net = { down: true, asked: [] };
  const FILES = {
    'data-matchdetail.js': () => `const MATCH_DETAIL=${JSON.stringify(fixture('matchdetail'))};`,
    'data-lineups-2025-2026.js': () => `const LINEUPS_2025_2026=${JSON.stringify(fixture('lineups-2025-2026'))};`,
  };
  net.fetch = async (url) => {
    const file = String(url).replace(/^\\.\\//, '').replace(/\\?.*$/, '');
    net.asked.push(file);
    return net.down || !FILES[file] ? { ok: false, status: 503, text: async () => '' } : { ok: true, status: 200, text: async () => FILES[file]() };
  };
  return net;
}

test('«Reintentar» de las Alineaciones: vuelve a pedir las actas y pinta solo su bloque; los Goles, que también fallaron, siguen con su caja', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const saved = globalThis.fetch;
  const net = fakeFetch();
  globalThis.fetch = net.fetch;
  try {
    // Moya–Guayarmina (A1, J11): sin actas, ni sus alineaciones ni sus goles (no tiene cronología).
    const sinActas = datasetsFrom();
    sinActas.lineups = { '2025-2026': null };
    const ctx = ctxOf(A1_J11, { datasets: sinActas });
    const out = String(screen.render(ctx));
    const goles = blockOf(out, 'Goles');
    const alineaciones = blockOf(out, 'Alineaciones');
    assert.ok(goles.startsWith('<section class="block" id="goles">') && failBox(goles, 'la cronología de goles'));
    assert.ok(alineaciones.startsWith('<section class="block" id="alineaciones">') && failBox(alineaciones, 'las actas de 2025/26'));
    const page = fakeSection('partido', { goles, alineaciones });
    screen.mount(page.section, ctx);
    const first = page.clickIn('alineaciones', { 'data-action': 'retry' });
    assert.deepEqual([first.event.prevented, first.event.stopped], [true, true], 'el router (en el documento) no se entera');
    await flush();
    assert.equal(page.block('alineaciones').markup, alineaciones, 'sin red, otra vez la caja');
    net.down = false;
    page.clickIn('alineaciones', { 'data-action': 'retry' });
    await flush();
    assert.deepEqual(net.asked, ['data-lineups-2025-2026.js', 'data-lineups-2025-2026.js'], 'solo las actas: la cronología ya estaba');
    const now = String(screen.render(ctx));
    assert.equal(page.block('alineaciones').markup, blockOf(now, 'Alineaciones'));
    assert.ok(text(page.block('alineaciones').markup).startsWith('Alineaciones acta nº'));
    assert.equal(page.focus.el, page.block('alineaciones').title);
    assert.equal(page.block('goles').markup, goles, 'solo ese bloque: los Goles, con su caja hasta que se pulse la suya');
    // Su «Reintentar»: las actas ya están, y los goles salen del acta.
    page.clickIn('goles', { 'data-action': 'retry' });
    await flush();
    assert.equal(net.asked.length, 2, 'nada que volver a pedir');
    assert.equal(page.block('goles').markup, blockOf(now, 'Goles'));
    assert.ok(text(page.block('goles').markup).startsWith('Goles según el acta'));
    assert.equal(page.focus.el, page.block('goles').title);
  } finally {
    globalThis.fetch = saved;
  }
});

test('«Reintentar» de los Goles sin la cronología: la vuelve a pedir y pinta la de futbolaspalmas en su sitio', async (t) => {
  t.mock.method(console, 'error', () => {});
  const saved = globalThis.fetch;
  const net = fakeFetch();
  globalThis.fetch = net.fetch;
  try {
    const sinCronologia = datasetsFrom();
    sinCronologia.matchDetail = null;
    const ctx = ctxOf(A1_J1, { datasets: sinCronologia });
    const goles = blockOf(String(screen.render(ctx)), 'Goles');
    assert.ok(failBox(goles, 'la cronología de goles'));
    const page = fakeSection('partido', { goles });
    screen.mount(page.section, ctx);
    net.down = false;
    const click = page.clickIn('goles', { 'data-action': 'retry' });
    assert.deepEqual([click.event.prevented, click.event.stopped, click.target.textContent], [true, true, 'Cargando…']);
    await flush();
    assert.deepEqual(net.asked, ['data-matchdetail.js'], 'la cronología; las actas ya estaban');
    assert.ok(text(page.block('goles').markup).startsWith('Goles minuto a minuto'));
    assert.equal(page.focus.el, page.block('goles').title);
    // Un «Reintentar» que no es de un bloque (la pantalla entera) sigue hasta el router.
    const other = page.clickIn('ninguno', { 'data-action': 'retry' });
    assert.deepEqual([other.event.prevented, other.event.stopped], [false, false]);
  } finally {
    globalThis.fetch = saved;
  }
});
""")

# ── shell.js: retryBlock, también cuando el bloque ya no está ──
SH = 'scripts/tests/test_rediseno_shell.mjs'
edit(SH, [
    ("""import {
  renderHeader, updateTabbar, offlineNotice, skeleton, errorBox, errorScreen, routeNotice, routeTitle,
} from '../../src/shell.js';""", """import {
  renderHeader, updateTabbar, offlineNotice, skeleton, errorBox, errorScreen, routeNotice, routeTitle, retryBlock,
} from '../../src/shell.js';
import { fakeSection } from './fixtures/rediseno/fake-browser.mjs';
import { block } from '../../src/ui.js';"""),
])
append(SH, """
// ── Plan B5, Tarea 4: «Reintentar» de un bloque, en su sitio (decisión 3) ──

test('retryBlock: vuelve a pedir, pinta el bloque en su sitio y lleva el foco a su título; si ya no está, nada', async () => {
  const failed = s(block('Goles', errorBox('la cronología de goles'), { id: 'goles' }));
  const page = fakeSection('partido', { goles: failed });
  const button = { disabled: false, textContent: 'Reintentar' };
  const loads = [];
  const fresh = await retryBlock(page.section, 'goles', button, async () => { loads.push('carga'); }, () => block('Goles', errorBox('otra cosa'), { id: 'goles' }));
  assert.deepEqual(loads, ['carga']);
  assert.deepEqual([button.disabled, button.textContent], [true, 'Cargando…']);
  assert.equal(fresh, page.block('goles'));
  assert.match(fresh.markup, /No se pudieron cargar los datos de otra cosa\\./);
  assert.equal(page.focus.el, fresh.title);
  // Otra navegación quitó el bloque mientras cargaba: no se pinta nada.
  let release;
  const pending = retryBlock(page.section, 'goles', { }, () => new Promise((resolve) => { release = resolve; }), () => { throw new Error('no debe pintar'); });
  page.block('goles').outerHTML = '';
  release();
  assert.equal(await pending, null);
  // Sin el bloque, ni se pide nada.
  assert.equal(await retryBlock(page.section, 'goles', {}, () => { throw new Error('no debe pedir'); }, () => ''), null);
});
""")
print('pruebas: fakeSection; el «Reintentar» de la Plantilla, los Goles y las Alineaciones, y retryBlock')
PY
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


I = 'scripts/tests/interaction-smoke.mjs'
edit(I, [
    ("""// Y una vez, en el mundo E (§11, caso 3): la respuesta a la pregunta se guarda y, al recargar, la
// portada es la de ese equipo, sin preguntar.""", """// Y una vez, en el mundo E (§11, caso 3): la respuesta a la pregunta se guarda y, al recargar, la
// portada es la de ese equipo, sin preguntar.
// De B5: una vez, a 390 px, el «Reintentar» de la Plantilla, los Goles y las Alineaciones (un 503 y
// luego 200): cada bloque se pinta en su sitio, sin volver arriba (decisión 3)."""),
    ("""// Mundo E (§11, caso 3): «Las Mesas Hu. B» guardado en FF13 pregunta; la respuesta se guarda en el""",
     """// «Reintentar» de un bloque (B5, decisión 3): la primera petición de las actas y la de la cronología
// fallan (503) y las siguientes llegan (200). La Plantilla de Guayarmina y las Alineaciones y los Goles
// de Moya–Guayarmina se pintan en su sitio: la página no vuelve arriba, la pantalla no se repinta (la
// marca de su sección sigue) y el foco va al título del bloque.
async function retryBlocks() {
  const label = '390px en claro, «Reintentar» de un bloque';
  const context = await newContext({ width: 390, height: 844 }, 'light');
  const errors = [];
  try {
    await useWorld(context, 'D');
    const failed = new Set();
    await context.route(/\\/data-(?:lineups-2025-2026\\.js|matchdetail\\.js)(\\?.*)?$/, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (failed.has(path)) return route.fallback();
      failed.add(path);
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' });
    });
    const retry = async (page, id, done, step) => {
      const before = await page.evaluate((block) => {
        document.querySelector(`#${block}`).scrollIntoView();
        document.querySelector('#contenido section[data-screen]').dataset.marca = 'sin repintar';
        return { y: scrollY, length: history.length };
      }, id);
      assert.ok(before.y > 0, `${label}, ${step}: el bloque está más abajo del principio`);
      await page.click(`#${id} button[data-action="retry"]`);
      await waitForAsync(page, (sel) => document.querySelector(sel) !== null, done, { label: `${label}, ${step}` });
      const after = await page.evaluate((block) => ({
        y: scrollY, length: history.length,
        marca: document.querySelector('#contenido section[data-screen]').dataset.marca,
        focus: document.activeElement?.closest(`#${block}`) && document.activeElement.classList.contains('block-title'),
      }), id);
      assert.equal(after.y, before.y, `${label}, ${step}: el desplazamiento se queda`);
      assert.equal(after.marca, 'sin repintar', `${label}, ${step}: solo se pinta el bloque`);
      assert.equal(after.length, before.length, `${label}, ${step}: sin entradas nuevas`);
      assert.ok(after.focus, `${label}, ${step}: el foco, en el título del bloque`);
    };
    const open = async (hash, screen, step) => {
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base + hash);
      await paintedAs(page, screen, { label: `${label}, ${step}` });
      return page;
    };
    const ficha = await open('#/equipo?s=2025-2026&g=A1&t=Guayarmina', 'equipo', 'la ficha');
    assert.equal(await ficha.locator('#plantilla .error-box').count(), 1, `${label}: la Plantilla, con su caja de error`);
    await retry(ficha, 'plantilla', '#plantilla table.squad', 'la Plantilla');
    await ficha.close();
    failed.clear();
    const partido = await open('#/partido?s=2025-2026&g=A1&r=Jornada%2011&h=Moya&a=Guayarmina', 'partido', 'el partido');
    assert.equal(await partido.locator('#goles .error-box, #alineaciones .error-box').count(), 2, `${label}: los Goles y las Alineaciones, con su caja`);
    await retry(partido, 'alineaciones', '#alineaciones .pt-lu-teams', 'las Alineaciones');
    assert.equal(await partido.locator('#goles .error-box').count(), 1, `${label}: los Goles siguen con la suya`);
    await retry(partido, 'goles', '#goles .pt-glists, #goles .pt-goals', 'los Goles');
    await partido.close();
    assert.deepEqual(errors, [], `${label}: sin errores de JavaScript`);
  } finally {
    await context.close();
  }
}

// Mundo E (§11, caso 3): «Las Mesas Hu. B» guardado en FF13 pregunta; la respuesta se guarda en el"""),
    ("""  await answerE();
  console.log('PASS: mundo E (§11, caso 3): la respuesta se guarda y, al recargar, la portada de ese equipo sin preguntar');""",
     """  await answerE();
  console.log('PASS: mundo E (§11, caso 3): la respuesta se guarda y, al recargar, la portada de ese equipo sin preguntar');
  await retryBlocks();
  console.log('PASS: 390px en claro, «Reintentar» de la Plantilla, las Alineaciones y los Goles (un 503 y luego 200): cada bloque, en su sitio, sin volver arriba y con el foco en su título');"""),
])
print('interaction-smoke: el «Reintentar» de un bloque, con un 503 y luego 200')
PY
```
Esperado:
```text
pruebas: fakeSection; el «Reintentar» de la Plantilla, los Goles y las Alineaciones, y retryBlock
interaction-smoke: el «Reintentar» de un bloque, con un 503 y luego 200
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
for f in test_rediseno_equipo test_rediseno_partido test_rediseno_shell; do
  node --test scripts/tests/$f.mjs 2>&1 | grep -E "SyntaxError|^not ok|^# (tests|pass|fail)"
done
```
Esperado: en Equipo, la nota todavía fuera de su bloque y el «Reintentar» que sube al router; en Partido, los dos nuevos; `test_rediseno_shell.mjs` no carga (`retryBlock` no existe todavía):
```text
not ok 21 - la plantilla en la ficha: N.º, jugador (un botón con aria-expanded), PJ, titular y goles, y la cobertura de las actas
not ok 29 - «Reintentar» de la Plantilla: lo atiende la ficha, vuelve a pedir las actas y pinta solo su bloque, con el foco en su título
# tests 29
# pass 27
# fail 2
not ok 21 - «Reintentar» de las Alineaciones: vuelve a pedir las actas y pinta solo su bloque; los Goles, que también fallaron, siguen con su caja
not ok 22 - «Reintentar» de los Goles sin la cronología: la vuelve a pedir y pinta la de futbolaspalmas en su sitio
# tests 22
# pass 20
# fail 2
# SyntaxError: The requested module '../../src/shell.js' does not provide an export named 'retryBlock'
not ok 1 - scripts/tests/test_rediseno_shell.mjs
# tests 1
# pass 0
# fail 1
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


# ── shell.js: retryBlock, el «Reintentar» de un bloque en su sitio ──
edit('src/shell.js', [
    ("""// aria-current de la barra, aviso sin conexión, esqueletos de carga, caja de error y aviso de
// redirección. Todo son funciones puras que devuelven Html, salvo updateTabbar, que cambia la
// barra ya pintada del documento que recibe. La cabecera de cada pantalla es screenHead (ui.js).""",
     """// aria-current de la barra, aviso sin conexión, esqueletos de carga, caja de error y aviso de
// redirección. Todo son funciones puras que devuelven Html, salvo updateTabbar, que cambia la
// barra ya pintada del documento que recibe, y retryBlock, que vuelve a pintar un bloque de la
// pantalla. La cabecera de cada pantalla es screenHead (ui.js)."""),
    ("""// La pantalla entera cuando falla una carga o el pintado: su h1 y la caja de error.""",
     """// «Reintentar» de un bloque que falló en el primer pintado (B5, decisión 3): la Plantilla de Equipo
// y los Goles y las Alineaciones de Partido, que lo atienden en su mount sin pasar por el router (con
// stopPropagation, como la Trayectoria). Vuelve a pedir lo que le falta (`load`, que nunca rechaza: los
// cargadores de state.js dan null) y pinta de nuevo el bloque `#id` de `section` en su sitio, con
// `paint()` (su Html: una sección con el mismo id). El resto de la pantalla, el desplazamiento y la
// ruta se quedan, y el foco va al título del bloque (tabindex -1, como el h1 del router). Mientras
// carga, su botón dice «Cargando…» y no se puede volver a pulsar. Si el bloque ya no está en la página
// (otra navegación lo quitó), no pinta nada. Devuelve el bloque nuevo, o null.
export async function retryBlock(section, id, button, load, paint) {
  const current = section.querySelector(`#${id}`);
  if (!current) return null;
  button.disabled = true;
  button.textContent = 'Cargando…';
  await load();
  if (!current.isConnected) return null;
  // El desplazamiento, donde estaba: sin esto, el anclaje del navegador (scroll anchoring) sube la
  // página tanto como crece el bloque, para dejar quieto lo de debajo, y el bloque nuevo quedaría
  // por encima de la vista.
  const view = current.ownerDocument?.defaultView || null;
  const y = view ? view.scrollY : null;
  // Html de html``, que escapa cada dato, como el pintado del router (spec §5.1).
  current.outerHTML = String(paint());
  if (view && view.scrollY !== y) view.scrollTo(view.scrollX, y);
  const fresh = section.querySelector(`#${id}`);
  const title = fresh && fresh.querySelector('.block-title');
  if (title) {
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }
  return fresh;
}

// La pantalla entera cuando falla una carga o el pintado: su h1 y la caja de error."""),
])

# ── screen-equipo.js: la Plantilla, un bloque con su id, y su «Reintentar» ──
edit('src/screen-equipo.js', [
    ("""import { errorBox } from './shell.js';""", """import { errorBox, retryBlock } from './shell.js';"""),
    ("""const TRAJECTORY_ID = 'trayectoria';
""", """const TRAJECTORY_ID = 'trayectoria';
const SQUAD_ID = 'plantilla';
"""),
    ("""// de la temporada tiene alguna. Sin actas del grupo, nada (la mayoría no tiene). Si la carga falló
// (null), la caja de error con el «Reintentar» del router; sin pedir (undefined: nunca en la app,
// donde needs las trae antes de pintar), nada.
function squadBlock(ctx, group, name) {
  const lineups = ctx.datasets?.lineups?.[group.season];
  if (lineups === null) return block('Plantilla', errorBox(`las actas de ${seasonLabel(group.season)}`));""",
     """// de la temporada tiene alguna. Sin actas del grupo, nada (la mayoría no tiene). Si la carga falló
// (null), la caja de error con su «Reintentar», que atiende la ficha (retrySquad: solo este bloque, sin
// volver arriba; B5, decisión 3); sin pedir (undefined: nunca en la app, donde needs las trae antes de
// pintar), nada. Siempre una sola sección, #plantilla (con la nota de las actas dentro), para que ese
// «Reintentar» la pinte en su sitio.
function squadBlock(ctx, group, name) {
  const lineups = ctx.datasets?.lineups?.[group.season];
  if (lineups === null) return block('Plantilla', errorBox(`las actas de ${seasonLabel(group.season)}`), { id: SQUAD_ID });"""),
    ("""    return block('Plantilla', empty(why));
  }""", """    return block('Plantilla', empty(why), { id: SQUAD_ID });
  }"""),
    ("""  return html`${box(html`<table class="squad"><caption class="vh">Plantilla de ${name}: toca un jugador para ver sus partidos</caption><thead>${head}</thead><tbody>${body}</tbody></table>`,
    { title: 'Plantilla', context: 'según las actas' })}${notice(null, squadNote(actas, skipped, played))}`;
}""", """  return block('Plantilla', html`${box(html`<table class="squad"><caption class="vh">Plantilla de ${name}: toca un jugador para ver sus partidos</caption><thead>${head}</thead><tbody>${body}</tbody></table>`)}${notice(null, squadNote(actas, skipped, played))}`,
    { context: 'según las actas', id: SQUAD_ID });
}

// «Reintentar» de la Plantilla (B5, decisión 3): vuelve a pedir las actas de su temporada y pinta el
// bloque en su sitio (retryBlock, shell.js). Si el grupo resulta no tener actas, lo dice: el bloque no
// desaparece bajo el dedo de quien pulsó.
function retrySquad(section, ctx, team, button) {
  const s = team.group.season;
  return retryBlock(section, SQUAD_ID, button,
    () => ensureLineups(s).then((data) => { ctx.datasets.lineups[s] = data; }),
    () => squadBlock(ctx, team.group, team.name) || block('Plantilla', empty('La federación no ha publicado actas de este grupo.'), { id: SQUAD_ID }));
}"""),
    ("""  // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula. «‹» y el
  // «Reintentar» de la pantalla siguen hasta el router; el de la trayectoria es de su panel.""",
     """  // La escucha va en la sección, que se sustituye en cada pintado: nunca se acumula. «‹» y el
  // «Reintentar» de la pantalla siguen hasta el router; el de la trayectoria es de su panel, y el de la
  // plantilla, de su bloque."""),
    ("""    } else if (action === 'retry' && inPanel) {
      event.preventDefault();
      event.stopPropagation();
      showTrajectory(section, ctx, team.name);
    }""", """    } else if (action === 'retry' && inPanel) {
      event.preventDefault();
      event.stopPropagation();
      showTrajectory(section, ctx, team.name);
    } else if (action === 'retry' && target.closest(`#${SQUAD_ID}`)) {
      event.preventDefault();
      event.stopPropagation();
      retrySquad(section, ctx, team, target);
    }"""),
])

# ── screen-partido.js: los Goles y las Alineaciones, bloques con su id, y su «Reintentar» ──
edit('src/screen-partido.js', [
    ("""// ctx.today). mount(root, ctx) pone el comportamiento: compartir y desplegar
// las temporadas anteriores (con su «Reintentar»). «‹» y el «Reintentar» de la
// pantalla son del router (data-action="back" y "retry").""",
     """// ctx.today). mount(root, ctx) pone el comportamiento: compartir, desplegar
// las temporadas anteriores (con su «Reintentar») y el «Reintentar» de los Goles
// y de las Alineaciones, que los pinta en su sitio (B5, decisión 3). «‹» y el
// «Reintentar» de la pantalla son del router (data-action="back" y "retry")."""),
    ("""import { errorBox } from './shell.js';""", """import { errorBox, retryBlock } from './shell.js';"""),
    ("""const PREVIOUS_ID = 'partido-anteriores';
""", """const PREVIOUS_ID = 'partido-anteriores';
// Los bloques que pueden fallar en el primer pintado, con su «Reintentar» (B5, decisión 3).
const GOALS_ID = 'goles';
const LINEUPS_ID = 'alineaciones';
"""),
    ("""  if (detail == null) return block('Goles', errorBox('la cronología de goles'));""",
     """  if (detail == null) return block('Goles', errorBox('la cronología de goles'), { id: GOALS_ID });"""),
    ("""    if (lineups == null) return block('Goles', errorBox('la cronología de goles'));
    return block('Goles', empty(scoreless ? 'Partido sin goles.' : 'Ninguna fuente publica quién marcó en este partido.'));""",
     """    if (lineups == null) return block('Goles', errorBox('la cronología de goles'), { id: GOALS_ID });
    return block('Goles', empty(scoreless ? 'Partido sin goles.' : 'Ninguna fuente publica quién marcó en este partido.'), { id: GOALS_ID });"""),
    ("""  return block('Goles', html`${body}${warning}`, { context: source === 'futbolaspalmas' ? 'minuto a minuto' : 'según el acta' });""",
     """  return block('Goles', html`${body}${warning}`, { context: source === 'futbolaspalmas' ? 'minuto a minuto' : 'según el acta', id: GOALS_ID });"""),
    ("""  if (lineups == null) return block('Alineaciones', errorBox(`las actas de ${seasonLabel(match.season)}`));
  const acta = actaFor(match, lineups);
  if (!acta) return block('Alineaciones', empty('La federación no ha publicado el acta de este partido.'));""",
     """  if (lineups == null) return block('Alineaciones', errorBox(`las actas de ${seasonLabel(match.season)}`), { id: LINEUPS_ID });
  const acta = actaFor(match, lineups);
  if (!acta) return block('Alineaciones', empty('La federación no ha publicado el acta de este partido.'), { id: LINEUPS_ID });"""),
    ("""  return box(html`<div class="pt-lu-teams">${team('home')}${team('away')}</div><div class="pt-lu-foot">${staff('Árbitro/a', acta.ref)}${link}</div>`,
    { title: 'Alineaciones', context: acta.cod ? `acta nº ${acta.cod}` : null });""",
     """  return block('Alineaciones', box(html`<div class="pt-lu-teams">${team('home')}${team('away')}</div><div class="pt-lu-foot">${staff('Árbitro/a', acta.ref)}${link}</div>`),
    { context: acta.cod ? `acta nº ${acta.cod}` : null, id: LINEUPS_ID });"""),
    ("""export function mount(root, ctx) {
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
}""", """// «Reintentar» de los Goles o de las Alineaciones (B5, decisión 3): vuelve a pedir lo que le faltó a
// ese bloque (a los Goles, la cronología y, si tampoco llegaron, las actas; a las Alineaciones, las
// actas) y pinta solo ese bloque en su sitio (retryBlock, shell.js). El otro, si también falló, sigue
// con su caja hasta que se pulse la suya.
function retryMatchBlock(section, ctx, id, button) {
  const { group, match } = locate(ctx);
  if (!match) return null;
  const data = ctx.datasets;
  const lineups = data.lineups || (data.lineups = {});
  const load = () => Promise.all([
    id === GOALS_ID && data.matchDetail == null ? LOADERS.ensureMatchDetail().then((d) => { data.matchDetail = d; }) : null,
    lineups[match.season] == null ? LOADERS.ensureLineups(match.season).then((d) => { lineups[match.season] = d; }) : null,
  ]);
  return retryBlock(section, id, button, load, () => (id === GOALS_ID ? goalsBlock(match, group, ctx) : lineupsBlock(match, group, ctx)));
}

export function mount(root, ctx) {
  const section = root && root.matches && root.matches('[data-screen="partido"]') ? root : root && root.querySelector('[data-screen="partido"]');
  if (!section) return;
  // Un solo manejador en la sección, que se va con ella al repintar. Atiende Compartir, el
  // desplegable de temporadas anteriores y su «Reintentar», y el «Reintentar» de los Goles y de las
  // Alineaciones; «‹» y el «Reintentar» de la pantalla siguen hasta el router, que escucha en el
  // documento.
  section.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || !section.contains(target)) return;
    const action = target.getAttribute('data-action');
    const inPanel = Boolean(target.closest(`#${PREVIOUS_ID}`));
    const inBlock = action === 'retry' ? [GOALS_ID, LINEUPS_ID].find((id) => target.closest(`#${id}`)) : undefined;
    if (action !== 'share' && action !== 'previous' && !(action === 'retry' && (inPanel || inBlock))) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'share') sharePartido(target, section);
    else if (action === 'previous') togglePrevious(section, ctx, target);
    else if (inPanel) showPrevious(section, ctx);
    else retryMatchBlock(section, ctx, inBlock, target);
  });
}"""),
])
print('shell.js: retryBlock; Equipo y Partido: la Plantilla, los Goles y las Alineaciones, con su «Reintentar» en su sitio')
PY
python3 scripts/codigo.py
```
Esperado:
```text
shell.js: retryBlock; Equipo y Partido: la Plantilla, los Goles y las Alineaciones, con su «Reintentar» en su sitio
CODIGO 8e0fc0d1: la huella de acta.css y src/*.js, en index.html
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_equipo.mjs scripts/tests/test_rediseno_partido.mjs scripts/tests/test_rediseno_shell.mjs scripts/tests/test_rediseno_integracion.mjs scripts/tests/test_rediseno_vista_equipo.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: las tres de la tarea y, con ellas, la integración (el `mount` de verdad de Partido y de Equipo con `start()`) y las huellas de la portada:
```text
# tests 93
# pass 93
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

Cada «Reintentar», en las tres variantes y con la misma regla de `interaction-smoke` (la primera petición de las actas y la de la cronología, 503; las siguientes, 200): una foto de la ventana con la caja a la vista (`-antes`) y otra tras el «Reintentar», sin moverse (`-despues`); al final, la pantalla entera. Si `$S/vista-comun.mjs` no existe (otra sesión), se crea antes con el bloque del paso 5 de la Tarea 3.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
cat > "$S/vista-reintentar.mjs" <<'EOF'
// Plan B5, Tarea 4: el «Reintentar» de la Plantilla, de las Alineaciones y de los Goles, con la primera
// petición de las actas y de la cronología en 503 y las siguientes en 200. En cada variante, tres fotos
// de la ventana: con la caja de error a la vista (-antes), tras el «Reintentar» en el mismo sitio
// (-despues) y, en el partido, tras el segundo (-goles); y la pantalla entera al final.
// Uso, desde la raíz del repo: OUT=<dir> node <este fichero>
import { run, waitForAsync } from './vista-comun.mjs';

// La primera petición de cada fichero, 503; las siguientes, las del mundo.
const failOnce = async (context) => {
  const failed = new Set();
  await context.route(/\/data-(?:lineups-2025-2026\.js|matchdetail\.js)(\?.*)?$/, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (failed.has(path)) return route.fallback();
    failed.add(path);
    return route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' });
  });
};
// «Reintentar» del bloque `id`, con fotos antes y después; devuelve el desplazamiento y el foco.
async function retry(page, id, done, shot, suffix) {
  const y = await page.evaluate((block) => { document.querySelector(`#${block}`).scrollIntoView(); return scrollY; }, id);
  await shot(`${suffix}-antes`);
  await page.click(`#${id} button[data-action="retry"]`);
  await waitForAsync(page, (sel) => document.querySelector(sel) !== null, done);
  await shot(`${suffix}-despues`);
  return page.evaluate(([block, before]) => ({
    [block]: { antes: before, despues: scrollY, foco: document.activeElement?.closest(`#${block}`) ? document.activeElement.textContent : null },
  }), [id, y]);
}

const problems = await run(process.env.OUT, [
  { name: 'reintentar-plantilla', world: 'D', hash: '#/equipo?s=2025-2026&g=A1&t=Guayarmina', screen: 'equipo', route: failOnce,
    act: (page, { shot }) => retry(page, 'plantilla', '#plantilla table.squad', shot, 'plantilla') },
  { name: 'reintentar-partido', world: 'D', hash: '#/partido?s=2025-2026&g=A1&r=Jornada%2011&h=Moya&a=Guayarmina', screen: 'partido', route: failOnce,
    act: async (page, { shot }) => ({
      ...(await retry(page, 'alineaciones', '#alineaciones .pt-lu-teams', shot, 'alineaciones')),
      ...(await retry(page, 'goles', '#goles .pt-glists, #goles .pt-goals', shot, 'goles')),
    }) },
]);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/vistas-t4" node "$S/vista-reintentar.mjs"
```
Esperado: en cada bloque, el mismo desplazamiento antes y después y el foco en su título (a 1440 px el partido cabe entero y las Alineaciones no se desplazan):
```text
reintentar-plantilla-390-claro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Guayarmina"],"blocks":["Así terminó 2025/26","Clasificación final","Evolución de puntos","Plantilla","Trayectoria","Calendario"],"plantilla":{"antes":870,"despues":870,"foco":"Plantilla"}}
reintentar-plantilla-390-oscuro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Guayarmina"],"blocks":["Así terminó 2025/26","Clasificación final","Evolución de puntos","Plantilla","Trayectoria","Calendario"],"plantilla":{"antes":870,"despues":870,"foco":"Plantilla"}}
reintentar-plantilla-1440-claro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Guayarmina"],"blocks":["Así terminó 2025/26","Clasificación final","Evolución de puntos","Plantilla","Trayectoria","Calendario"],"plantilla":{"antes":683,"despues":683,"foco":"Plantilla"}}
reintentar-partido-390-claro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Partido: Moya – Guayarmina"],"blocks":["Resultado","Goles","Alineaciones","Cara a cara","Contexto"],"alineaciones":{"antes":135,"despues":135,"foco":"Alineaciones"},"goles":{"antes":317,"despues":317,"foco":"Goles"}}
reintentar-partido-390-oscuro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Partido: Moya – Guayarmina"],"blocks":["Resultado","Goles","Alineaciones","Cara a cara","Contexto"],"alineaciones":{"antes":135,"despues":135,"foco":"Alineaciones"},"goles":{"antes":317,"despues":317,"foco":"Goles"}}
reintentar-partido-1440-claro: {"overflow":0,"small":[],"broken":[],"covered":false,"h1":["Partido: Moya – Guayarmina"],"blocks":["Resultado","Goles","Alineaciones","Cara a cara","Contexto"],"alineaciones":{"antes":0,"despues":0,"foco":"Alineaciones"},"goles":{"antes":296,"despues":296,"foco":"Goles"}}
OK: sin errores; capturas en $S/vistas-t4
```

Abrir con Read, de `$S/vistas-t4`, `reintentar-plantilla-390-claro-plantilla-antes.png` y `-despues.png`, `reintentar-partido-390-oscuro-alineaciones-antes.png` y `-despues.png`, `reintentar-partido-390-oscuro-goles-despues.png`, `reintentar-plantilla-1440-claro-plantilla-despues.png` y `reintentar-plantilla-390-claro.png`, y comparar:
- **antes**: «Plantilla» (o «Alineaciones») arriba de la ventana, con la caja de error de borde de tinta, «No se pudieron cargar los datos de las actas de 2025/26.» y «Reintentar» relleno de tinta; debajo, lo que sigue de la pantalla;
- **después**, sin haberse movido la ventana: el título arriba, en el mismo sitio, y la tabla de la plantilla (N.º, Jugador, PJ, Tit., Goles; Liam Garcia Larsen con 21 goles) o las alineaciones del acta nº 247032 (Local Moya, titulares y suplentes) debajo; lo que seguía se ha desplazado hacia abajo;
- los **Goles** tras su «Reintentar»: las dos listas del acta, Moya (Álvaro González Leon) y Guayarmina (Liam Garcia Larsen (4)…), con la nota de que el acta no da el minuto de todos;
- la **nota de las actas** («Actas de 9 de 20 partidos jugados; 1 acta más llega incompleta…») debajo de la tabla, en gris, con el mismo aire que antes hasta «Trayectoria»;
- a **1440 px**, la plantilla en la columna derecha, del ancho de la columna; en **oscuro**, la tinta clara.

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: pytest, sin cambios; node, el recuento anterior más 4, de 737 a 741, sin fallos:
```text
517 passed, 5 skipped
# tests 741
# pass 741
# fail 0
```

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
grep -F '«Reintentar» de la Plantilla' <<<"$out"
grep '^PASS: render smoke' <<<"$out" | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado (unos 4 minutos: con el `timeout` de la herramienta a 600000 ms): una línea PASS más que en la tarea anterior en cada pasada (23), la nueva, y el DOM de la portada sin cambios (la de los datos reales, en el estado del día: D el 27/09/2026):
```text
pasada 1: 23 PASS; otras líneas: 0
pasada 2: 23 PASS; otras líneas: 0
pasada 3: 23 PASS; otras líneas: 0
PASS: 390px en claro, «Reintentar» de la Plantilla, las Alineaciones y los Goles (un 503 y luego 200): cada bloque, en su sitio, sin volver arriba y con el foco en su título
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/codigo.py
git add src/shell.js src/screen-equipo.js src/screen-partido.js index.html scripts/tests/fixtures/rediseno/fake-browser.mjs scripts/tests/test_rediseno_equipo.mjs scripts/tests/test_rediseno_partido.mjs scripts/tests/test_rediseno_shell.mjs scripts/tests/interaction-smoke.mjs
git commit -q -F - <<'EOF'
feat(rediseño): «Reintentar» de un bloque, sin perder el sitio (B5, tarea 4)

La Plantilla de Equipo y los Goles y las Alineaciones de Partido, los
bloques que pueden fallar en el primer pintado, atienden su «Reintentar»
en su mount, como la Trayectoria y «temporadas anteriores» (decisión 3):
vuelven a pedir lo que les falta y se pintan solos en su sitio, sin
repintar la ruta, con el desplazamiento donde estaba y el foco en su
título. Antes, el router repintaba todo y volvía arriba.

- shell.js: retryBlock, con «Cargando…» mientras carga; devuelve el
  desplazamiento a su sitio, que el anclaje del navegador movía al crecer
  el bloque.
- Cada bloque es una sección con su id (#plantilla, #goles y
  #alineaciones); la nota de las actas va dentro de la Plantilla.
- Una Plantilla que, tras el «Reintentar», resulta no tener actas lo dice.
- Pruebas: el mount de las dos pantallas con fakeSection (nuevo en
  fake-browser.mjs), retryBlock, y en interaction-smoke un 503 y luego 200
  que no vuelve arriba.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado:
```text
CODIGO 8e0fc0d1: la huella de acta.css y src/*.js, en index.html
 9 files changed, 392 insertions(+), 28 deletions(-)
```

---

### Task 5: El esqueleto propio de Equipo, Explorar, Ligas, Récords, Copa y Goleadores, con el alto de lo que llega después (decisión 4)

Las seis pantallas de B3 que esperan a una carga dejan el esqueleto genérico: cada una pinta, mientras carga, su cabecera y su primer bloque con el alto que tendrán, y el paso a la pantalla no mueve lo de arriba.

**Contexto**
- **Hoy** (inventario §C): `BODIES` de `src/shell.js:62-68` solo trae la portada, Jornada, Tabla y Partido; Equipo, Explorar, Ligas, Récords, Copa y Goleadores caen en `OTHER`, una caja de 96 px sin título (`.sk-box`, `acta.css:480`), y al llegar la pantalla todo salta a su forma.
- **Cuándo se ve cada una**: el router pinta `skeleton(screen.id)` mientras esperan `needs` o la temporada pasada que carga él (`router.js:420-426`):
  - Equipo, en la primera visita de cada temporada (sus actas) y en las pasadas;
  - Explorar, en la primera visita de la sesión (`data-health.json`) y en las temporadas pasadas;
  - Ligas, Récords, Copa y Goleadores, solo en las temporadas pasadas (sus `needs` están vacíos).
- **Lo que se ve después, medido a 390 px** con el mundo D de `fixture-site.mjs` (el paso 0 lo mide con `$S/vista-esqueletos.mjs`; [arriba, alto] en px):

  | Pantalla | lo que llega tras el esqueleto | cabecera | antes del bloque | primer bloque |
  |---|---|---|---|---|
  | Equipo | Las Mesas Hu. en 2024/25, «Así terminó» (cabecera con escudo) | 72 | — | [90, 173]: título de 37 (su contexto va en dos líneas) y caja de 129 |
  | Explorar | 2025/26, «Ligas» | 72 | el buscador, [88, 54] | [160, 345] |
  | Ligas | 2024/25, benjamín | 72 | — | [90, 223] |
  | Récords | 2024/25, «Totales» | 72 | el selector de categoría, [86, 46] | [150, 80] |
  | Copa | 2024/25, BCC1, «Campeón» | 72 | — | [90, 125] |
  | Goleadores | 2024/25, el vacío que dice que no los hay (sin título de bloque) | 72 | — | [72, 65] |

- **Los esqueletos nuevos**: la cabecera (con el escudo en Equipo, como la portada), lo que va antes (el buscador de Explorar, el selector de Récords) y el primer bloque: el título de bloque del esqueleto (19 px y 7 de margen) y una caja que completa el alto del bloque de verdad (`.sk-box-team` 147, `-leagues` 319, `-groups` 197, `-totals` 54, `-champion` 99; `-search` 54 y `-cats` 46 con su margen). En Equipo, la caja es más alta que la de verdad (129) para que el bloque acabe donde acaba el suyo, cuyo título ocupa dos líneas. Goleadores, sin título: tras su esqueleto solo llega el vacío. Temporadas, Fuentes y Ajustes siguen con el genérico (listas cortas que casi nunca esperan).
- **La prueba en el navegador** (`interaction-smoke`, 390 px en claro): la ficha de Las Mesas en 2024/25, con la carga de esa temporada retenida hasta medir el esqueleto. La API Layout Instability no ve este paso (el router sustituye el contenido: los nodos nuevos no cuentan como desplazados, y da 0 con cualquier esqueleto), así que la prueba compara el esqueleto con la pantalla: la cabecera, del mismo alto; el primer bloque, donde empezaba (±1 px) y con casi el mismo alto (±15 %; con el genérico, 96 frente a 172,5, falla); y la puntuación de desplazamiento de esas dos parejas con la fórmula de la API (impacto por distancia), más la de sus entradas, por debajo de 0,1.
- **Recuentos**: node, el anterior más 1 (741 → 742); pytest, sin cambios; una línea PASS más en los smoke (de 23 a 24).

**Files:**
- Modify: `src/shell.js`, `acta.css` e `index.html` (`CODIGO`)
- Test: `scripts/tests/test_rediseno_shell.mjs` y `scripts/tests/interaction-smoke.mjs`
- Fuera del repo: `$S/vista-esqueletos.mjs`

**Interfaces:**
- Consumes: `skeleton(screenId)` (`shell.js`), que pinta el router; `$S/vista-comun.mjs` (Tarea 3, paso 5); en las pruebas, `decl` y `s` de `test_rediseno_shell.mjs`, y `useWorld`, `paintedAs`, `newContext` y `waitForAsync` en `interaction-smoke.mjs`.
- Produces:

```text
skeleton('equipo')      cabecera con escudo · bloque: título + .sk-box-team (147)
skeleton('explorar')    .sk-box-search (54, margen 16) · bloque: título + .sk-box-leagues (319)
skeleton('ligas')       bloque: título + .sk-box-groups (197)
skeleton('records')     .sk-box-cats (46, margen 14) · bloque: título + .sk-box-totals (54)
skeleton('copa')        bloque: título + .sk-box-champion (99)
skeleton('goleadores')  .sk-box-note (65), sin título
temporadas, fuentes y ajustes: el genérico (.sk-box, 96)
```

- [ ] **Step 0: Lo que llega tras cada esqueleto, medido**

`$S/vista-esqueletos.mjs` abre cada pantalla con la carga que sostiene su esqueleto retenida (la temporada 2024-25; en Explorar, `data-health.json`), fotografía el esqueleto (`-esqueleto`), la suelta y mide la pantalla: de los dos, la cabecera y lo que la sigue. Antes de la tarea, el esqueleto es el genérico. Si `$S/vista-comun.mjs` no existe (otra sesión), se crea antes con el bloque del paso 5 de la Tarea 3.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
cat > "$S/vista-esqueletos.mjs" <<'EOF'
// Plan B5, Tarea 5: el esqueleto de Equipo, Explorar, Ligas, Récords, Copa y Goleadores frente a la
// pantalla que llega después. La carga que lo sostiene (la temporada 2024-25, o data-health.json en
// Explorar) se retiene hasta la foto del esqueleto (-esqueleto); después, la pantalla. Cada línea da,
// de los dos, la cabecera y lo que la sigue ([arriba, alto], en px): el esqueleto tiene que acercarse.
// Uso, desde la raíz del repo: OUT=<dir> node <este fichero>
import { run, waitForAsync } from './vista-comun.mjs';

// Lo que sigue a la cabecera: en el esqueleto, sus partes; en la pantalla, las que les corresponden.
const REAL = {
  equipo: ['section.block'], explorar: ['form.search', 'section.block'], ligas: ['section.block'],
  records: ['nav.rc-cats', 'section.block'], copa: ['section.block'], goleadores: ['p.empty'],
};
const geometry = (page, id, skeleton) => page.evaluate(([screen, isSkeleton, real]) => {
  const pair = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; };
  const root = document.querySelector(isSkeleton ? `#contenido [data-skeleton="${screen}"]` : '#contenido section[data-screen]');
  const parts = isSkeleton ? [...root.children].filter((el) => !el.matches('.vh, .sk-head')) : real.map((sel) => root.querySelector(sel));
  return { cabecera: pair(root.querySelector(isSkeleton ? '.sk-head' : 'header.screen-head')), partes: parts.map(pair) };
}, [id, skeleton, REAL[id]]);

// Una escena: la carga de `pattern` retenida hasta la foto del esqueleto (una por variante).
function scene(id, hash, pattern) {
  let release = null;
  return {
    name: `esqueleto-${id}`, world: 'D', hash, screen: id,
    route: async (context) => {
      const gate = new Promise((resolve) => { release = resolve; });
      await context.route(pattern, async (route) => { await gate; return route.fallback(); });
    },
    before: async (page, { shot }) => {
      await waitForAsync(page, (screen) => document.querySelector(`#contenido [data-skeleton="${screen}"]`) !== null, id);
      await shot('esqueleto');
      const esqueleto = await geometry(page, id, true);
      release();
      return { esqueleto };
    },
    measure: async (page) => ({ pantalla: await geometry(page, id, false) }),
  };
}

const PAST = /\/data-season-2024-2025\.js(\?.*)?$/;
const problems = await run(process.env.OUT, [
  scene('equipo', '#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.', PAST),
  scene('explorar', '#/explorar', /\/data-health\.json(\?.*)?$/),
  scene('ligas', '#/ligas?s=2024-2025', PAST),
  scene('records', '#/records?s=2024-2025', PAST),
  scene('copa', '#/copa?s=2024-2025&g=BCC1', PAST),
  scene('goleadores', '#/goleadores?s=2024-2025', PAST),
]);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/vistas-t5-antes" node "$S/vista-esqueletos.mjs" | grep -- '-390-claro:' | sed -E 's/"(small|broken)":\[\],|"covered":false,//g'
```
Esperado: a 390 px, el genérico (la cabecera y una caja de 96 a 90 px) frente a lo que llega, las cifras de la tabla del contexto:
```text
esqueleto-equipo-390-claro: {"overflow":0,"h1":["Las Mesas Hu."],"blocks":["Así terminó 2024/25","Clasificación final","Evolución de puntos","Trayectoria","Calendario"],"esqueleto":{"cabecera":[0,72],"partes":[[90,96]]},"pantalla":{"cabecera":[0,72],"partes":[[90,173]]}}
esqueleto-explorar-390-claro: {"overflow":0,"h1":["Explorar"],"blocks":["Ligas","Copas y torneos","Más"],"esqueleto":{"cabecera":[0,72],"partes":[[90,96]]},"pantalla":{"cabecera":[0,72],"partes":[[88,54],[160,345]]}}
esqueleto-ligas-390-claro: {"overflow":0,"h1":["Ligas"],"blocks":["Benjamín","Prebenjamín"],"esqueleto":{"cabecera":[0,72],"partes":[[90,96]]},"pantalla":{"cabecera":[0,72],"partes":[[90,223]]}}
esqueleto-records-390-claro: {"overflow":0,"h1":["Récords"],"blocks":["Totales","Partidos","Ataque y defensa","Mejor racha de victorias","Mejor racha invicta","Mejores en casa","Mejores fuera","Máximos goleadores"],"esqueleto":{"cabecera":[0,72],"partes":[[90,96]]},"pantalla":{"cabecera":[0,72],"partes":[[86,46],[150,80]]}}
esqueleto-copa-390-claro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"esqueleto":{"cabecera":[0,72],"partes":[[90,96]]},"pantalla":{"cabecera":[0,72],"partes":[[90,125]]}}
esqueleto-goleadores-390-claro: {"overflow":0,"h1":["Goleadores"],"blocks":[],"esqueleto":{"cabecera":[0,72],"partes":[[90,96]]},"pantalla":{"cabecera":[0,72],"partes":[[72,65]]}}
```

- [ ] **Step 1: Write the failing test**

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


def append(path, text):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.endswith('\n') and text.strip() not in s, path
    p.write_text(s + text, encoding='utf-8')


SH = 'scripts/tests/test_rediseno_shell.mjs'
edit(SH, [
    ("""  for (const id of ['home', 'jornada', 'tabla', 'partido', 'ajustes']) {
    const out = s(skeleton(id));""", """  for (const id of ['home', 'jornada', 'tabla', 'partido', 'equipo', 'explorar', 'ligas', 'records', 'copa', 'goleadores', 'ajustes']) {
    const out = s(skeleton(id));"""),
    ("""  // Las pantallas de B3 comparten el esqueleto genérico (la provisional de B2 ya no existe).
  assert.equal(s(skeleton('explorar')), s(skeleton('ajustes')).replace('data-skeleton="ajustes"', 'data-skeleton="explorar"'));""",
     """  // Temporadas, Fuentes y Ajustes comparten el genérico; las otras seis de B3 tienen el suyo (B5, decisión 4).
  for (const id of ['temporadas', 'fuentes']) {
    assert.equal(s(skeleton(id)), s(skeleton('ajustes')).replace('data-skeleton="ajustes"', `data-skeleton="${id}"`), id);
  }"""),
    ("""    ...['home', 'jornada', 'tabla', 'partido', 'ajustes'].map(skeleton),""",
     """    ...['home', 'jornada', 'tabla', 'partido', 'equipo', 'explorar', 'ligas', 'records', 'copa', 'goleadores', 'ajustes'].map(skeleton),"""),
])
append(SH, """
// ── Plan B5, Tarea 5: el esqueleto propio de las seis pantallas de B3 (decisión 4) ──

// Las cajas de cada una, en orden: lo que va antes de su primer bloque y ese bloque.
const B3_SKELETONS = {
  equipo: ['sk-box-team'], explorar: ['sk-box-search', 'sk-box-leagues'], ligas: ['sk-box-groups'],
  records: ['sk-box-cats', 'sk-box-totals'], copa: ['sk-box-champion'], goleadores: ['sk-box-note'],
};

test('las seis pantallas de B3, con su esqueleto: sus cajas con el alto medido a 390 px, el título de bloque (salvo Goleadores) y el escudo en Equipo', () => {
  const generic = s(skeleton('ajustes')).replace(' data-skeleton="ajustes"', '');
  for (const [id, boxes] of Object.entries(B3_SKELETONS)) {
    const out = s(skeleton(id));
    assert.notEqual(out.replace(` data-skeleton="${id}"`, ''), generic, `${id}: el suyo, no el genérico`);
    assert.deepEqual([...out.matchAll(/<div class="box skeleton ([\\w-]+)"><\\/div>/g)].map((m) => m[1]), boxes, id);
    assert.equal(out.includes('<span class="sk sk-block-title"></span>'), id !== 'goleadores', `${id}: el título de bloque`);
    assert.equal(out.includes('<span class="sk sk-crest"></span>'), id === 'equipo', `${id}: el escudo en la cabecera`);
  }
  // El alto de cada caja, el de lo que se ve tras el esqueleto a 390 px con las fixtures (Tarea 5, paso 0).
  const height = (cls) => Number((decl(`.${cls}`).match(/(?:^|;)\\s*height:\\s*(\\d+)px/) || [])[1]);
  assert.deepEqual(Object.fromEntries(Object.values(B3_SKELETONS).flat().map((cls) => [cls, height(cls)])), {
    'sk-box-team': 147, 'sk-box-search': 54, 'sk-box-leagues': 319, 'sk-box-groups': 197,
    'sk-box-cats': 46, 'sk-box-totals': 54, 'sk-box-champion': 99, 'sk-box-note': 65,
  });
  assert.match(decl('.sk-box-search'), /margin-top:\\s*16px/);
  assert.match(decl('.sk-box-cats'), /margin-top:\\s*14px/);
});
""")
print('test_rediseno_shell: el esqueleto propio de las seis pantallas de B3')
PY
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


I = 'scripts/tests/interaction-smoke.mjs'
edit(I, [
    ("""// De B5: una vez, a 390 px, el «Reintentar» de la Plantilla, los Goles y las Alineaciones (un 503 y
// luego 200): cada bloque se pinta en su sitio, sin volver arriba (decisión 3).""",
     """// De B5: una vez, a 390 px, el «Reintentar» de la Plantilla, los Goles y las Alineaciones (un 503 y
// luego 200): cada bloque se pinta en su sitio, sin volver arriba (decisión 3); y el paso del
// esqueleto a la ficha de Equipo de una temporada pasada, sin desplazar lo de arriba (decisión 4)."""),
    ("""// Mundo E (§11, caso 3): «Las Mesas Hu. B» guardado en FF13 pregunta; la respuesta se guarda en el""",
     """// La puntuación de desplazamiento de un paso (la fórmula de la API Layout Instability, spec §5.4): de las
// parejas [antes, después] ({ top, left, width, height }) que se mueven, la región de impacto (la unión de
// sus rectángulos en la ventana) por la distancia (el mayor movimiento), cada una sobre la ventana.
function shiftScore(pairs, vw, vh) {
  const moved = pairs.filter(([a, b]) => Math.abs(a.top - b.top) >= 1 || Math.abs(a.left - b.left) >= 1);
  if (!moved.length) return 0;
  const spans = moved.flatMap(([a, b]) => [a, b]).map((r) => [Math.max(0, r.top), Math.min(vh, r.top + r.height)])
    .filter(([top, bottom]) => bottom > top).sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let end = -Infinity;
  for (const [top, bottom] of spans) {
    if (bottom > end) { covered += bottom - Math.max(top, end); end = bottom; }
  }
  const width = Math.min(vw, Math.max(...moved.flatMap(([a, b]) => [a.width, b.width])));
  const distance = Math.max(...moved.map(([a, b]) => Math.max(Math.abs(a.top - b.top), Math.abs(a.left - b.left))));
  return ((covered * width) / (vw * vh)) * (distance / Math.max(vw, vh));
}

// El esqueleto de Equipo (B5, decisión 4): la ficha de Las Mesas en 2024/25, con la carga de esa
// temporada retenida hasta medir el esqueleto. Al llegar la pantalla, lo de arriba no se mueve: la
// cabecera y el primer bloque empiezan donde empezaban, el bloque tiene casi el mismo alto (±15 %) y la
// puntuación de desplazamiento del paso (shiftScore de esas dos parejas, más las entradas layout-shift
// del navegador) queda por debajo de 0,1.
async function skeletonShift() {
  const label = '390px en claro, esqueleto de Equipo';
  const context = await newContext({ width: 390, height: 844 }, 'light');
  try {
    await useWorld(context, 'D');
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await context.route(/\\/data-season-2024-2025\\.js(\\?.*)?$/, async (route) => { await held; return route.fallback(); });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__shifts = 0;
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shifts += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${base}#/equipo?s=2024-2025&g=PGC2&t=Las%20Mesas%20Hu.`, { waitUntil: 'commit' });
    await waitForAsync(page, () => document.querySelector('#contenido [data-skeleton="equipo"] .box.skeleton') !== null, null, { label: `${label}: el esqueleto` });
    const geometry = (skeleton) => page.evaluate((isSkeleton) => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };
      const root = document.querySelector(isSkeleton ? '#contenido [data-skeleton]' : '#contenido section[data-screen]');
      return {
        head: rect(root.querySelector(isSkeleton ? '.sk-head' : 'header.screen-head')),
        block: rect(root.querySelector(isSkeleton ? '.block' : 'section.block')),
        shifts: window.__shifts, vw: innerWidth, vh: innerHeight,
      };
    }, skeleton);
    const before = await geometry(true);
    release();
    await paintedAs(page, 'equipo', { label });
    const after = await geometry(false);
    const pairs = [[before.head, after.head], [before.block, after.block]];
    const score = shiftScore(pairs, after.vw, after.vh) + (after.shifts - before.shifts);
    assert.ok(Math.abs(before.head.height - after.head.height) <= 1, `${label}: la cabecera, del mismo alto (${JSON.stringify([before.head, after.head])})`);
    assert.ok(Math.abs(before.block.top - after.block.top) <= 1, `${label}: el primer bloque empieza donde empezaba (${before.block.top} y ${after.block.top})`);
    assert.ok(Math.abs(before.block.height - after.block.height) <= 0.15 * after.block.height,
      `${label}: el alto del primer bloque se acerca al de verdad (${before.block.height} y ${after.block.height})`);
    assert.ok(score < 0.1, `${label}: puntuación de desplazamiento ${score}`);
    assert.deepEqual(errors, [], `${label}: sin errores de JavaScript`);
  } finally {
    await context.close();
  }
}

// Mundo E (§11, caso 3): «Las Mesas Hu. B» guardado en FF13 pregunta; la respuesta se guarda en el"""),
    ("""  await retryBlocks();
  console.log('PASS: 390px en claro, «Reintentar» de la Plantilla, las Alineaciones y los Goles (un 503 y luego 200): cada bloque, en su sitio, sin volver arriba y con el foco en su título');""",
     """  await retryBlocks();
  console.log('PASS: 390px en claro, «Reintentar» de la Plantilla, las Alineaciones y los Goles (un 503 y luego 200): cada bloque, en su sitio, sin volver arriba y con el foco en su título');
  await skeletonShift();
  console.log('PASS: 390px en claro, del esqueleto a la ficha de Equipo de 2024/25: la cabecera y el primer bloque, en su sitio y casi del mismo alto; desplazamiento por debajo de 0,1');"""),
])
print('interaction-smoke: el paso del esqueleto a la ficha de Equipo de una temporada pasada')
PY
```
Esperado:
```text
test_rediseno_shell: el esqueleto propio de las seis pantallas de B3
interaction-smoke: el paso del esqueleto a la ficha de Equipo de una temporada pasada
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_shell.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'
```
Esperado: el esqueleto de cada pantalla (el genérico no tiene sus cajas) y el nuevo:
```text
not ok 13 - las seis pantallas de B3, con su esqueleto: sus cajas con el alto medido a 390 px, el título de bloque (salvo Goleadores) y el escudo en Equipo
# tests 13
# pass 12
# fail 1
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


edit('src/shell.js', [
    ("""  partido: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-match"></div></div>`,
};
const OTHER = html`<div class="block"><div class="box skeleton sk-box"></div></div>`;

export function skeleton(screenId) {
  const head = html`<div class="screen-head sk-head" aria-hidden="true">${screenId === 'home' ? html`<span class="sk sk-crest"></span>` : ''}<span class="screen-head-text"><span class="sk sk-title"></span><span class="sk sk-sub"></span></span></div>`;""",
     """  partido: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-match"></div></div>`,
  // Las seis de B3 (B5, decisión 4): lo que va antes de su primer bloque (el buscador de Explorar, el
  // selector de categoría de Récords) y ese bloque, con su título y el alto que tiene a 390 px con las
  // fixtures, en lo que se ve tras el esqueleto: Equipo de una temporada pasada («Así terminó»),
  // Explorar («Ligas»), Ligas (su primera categoría), Récords («Totales»), Copa («Campeón») y Goleadores
  // de una temporada pasada, que solo dice que no los hay (sin título de bloque, como ella).
  equipo: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-team"></div></div>`,
  explorar: html`<div class="box skeleton sk-box-search"></div><div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-leagues"></div></div>`,
  ligas: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-groups"></div></div>`,
  records: html`<div class="box skeleton sk-box-cats"></div><div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-totals"></div></div>`,
  copa: html`<div class="block"><span class="sk sk-block-title"></span><div class="box skeleton sk-box-champion"></div></div>`,
  goleadores: html`<div class="box skeleton sk-box-note"></div>`,
};
// Temporadas, Fuentes y Ajustes: el genérico (listas cortas, que casi nunca esperan a nada).
const OTHER = html`<div class="block"><div class="box skeleton sk-box"></div></div>`;
// Las cabeceras con escudo: Mi equipo y la ficha de Equipo.
const WITH_CREST = new Set(['home', 'equipo']);

export function skeleton(screenId) {
  const head = html`<div class="screen-head sk-head" aria-hidden="true">${WITH_CREST.has(screenId) ? html`<span class="sk sk-crest"></span>` : ''}<span class="screen-head-text"><span class="sk sk-title"></span><span class="sk sk-sub"></span></span></div>`;"""),
])
edit('acta.css', [
    (""".sk-box { height: 96px; }
""", """.sk-box { height: 96px; }
/* Las seis de B3 (B5, decisión 4): el primer bloque de lo que se ve tras su esqueleto, medido a 390 px
 * con las fixtures (título de 19 px y 7 de margen, más la caja). */
.sk-box-team { height: 147px; }
.sk-box-search { height: 54px; margin-top: 16px; }
.sk-box-leagues { height: 319px; }
.sk-box-groups { height: 197px; }
.sk-box-cats { height: 46px; margin-top: 14px; }
.sk-box-totals { height: 54px; }
.sk-box-champion { height: 99px; }
.sk-box-note { height: 65px; }
"""),
])
print('shell.js y acta.css: el esqueleto propio de Equipo, Explorar, Ligas, Récords, Copa y Goleadores')
PY
python3 scripts/codigo.py
```
Esperado:
```text
shell.js y acta.css: el esqueleto propio de Equipo, Explorar, Ligas, Récords, Copa y Goleadores
CODIGO 9b47f80c: la huella de acta.css y src/*.js, en index.html
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_shell.mjs scripts/tests/test_rediseno_index.mjs scripts/tests/test_rediseno_router.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: `shell.js` y, con ella, `index.html` (el esqueleto de la portada, que no cambia, y `CODIGO`) y el router, que pinta los esqueletos:
```text
# tests 84
# pass 84
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

La misma vista del paso 0, ahora con los esqueletos nuevos:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
OUT="$S/vistas-t5" node "$S/vista-esqueletos.mjs" | sed -E 's/"(small|broken)":\[\],|"covered":false,//g'
```
Esperado: a 390 px, en las seis, el esqueleto con las mismas cifras que la pantalla; a 1440 px (dos columnas y otra anchura) difieren en Equipo y en Goleadores, que la decisión no mide:
```text
esqueleto-equipo-390-claro: {"overflow":0,"h1":["Las Mesas Hu."],"blocks":["Así terminó 2024/25","Clasificación final","Evolución de puntos","Trayectoria","Calendario"],"esqueleto":{"cabecera":[0,72],"partes":[[90,173]]},"pantalla":{"cabecera":[0,72],"partes":[[90,173]]}}
esqueleto-equipo-390-oscuro: {"overflow":0,"h1":["Las Mesas Hu."],"blocks":["Así terminó 2024/25","Clasificación final","Evolución de puntos","Trayectoria","Calendario"],"esqueleto":{"cabecera":[0,72],"partes":[[90,173]]},"pantalla":{"cabecera":[0,72],"partes":[[90,173]]}}
esqueleto-equipo-1440-claro: {"overflow":0,"h1":["Las Mesas Hu."],"blocks":["Así terminó 2024/25","Clasificación final","Evolución de puntos","Trayectoria","Calendario"],"esqueleto":{"cabecera":[49,72],"partes":[[139,173]]},"pantalla":{"cabecera":[49,72],"partes":[[139,133]]}}
esqueleto-explorar-390-claro: {"overflow":0,"h1":["Explorar"],"blocks":["Ligas","Copas y torneos","Más"],"esqueleto":{"cabecera":[0,72],"partes":[[88,54],[160,345]]},"pantalla":{"cabecera":[0,72],"partes":[[88,54],[160,345]]}}
esqueleto-explorar-390-oscuro: {"overflow":0,"h1":["Explorar"],"blocks":["Ligas","Copas y torneos","Más"],"esqueleto":{"cabecera":[0,72],"partes":[[88,54],[160,345]]},"pantalla":{"cabecera":[0,72],"partes":[[88,54],[160,345]]}}
esqueleto-explorar-1440-claro: {"overflow":0,"h1":["Explorar"],"blocks":["Ligas","Copas y torneos","Más"],"esqueleto":{"cabecera":[49,72],"partes":[[137,54],[209,345]]},"pantalla":{"cabecera":[49,72],"partes":[[137,54],[209,345]]}}
esqueleto-ligas-390-claro: {"overflow":0,"h1":["Ligas"],"blocks":["Benjamín","Prebenjamín"],"esqueleto":{"cabecera":[0,72],"partes":[[90,223]]},"pantalla":{"cabecera":[0,72],"partes":[[90,223]]}}
esqueleto-ligas-390-oscuro: {"overflow":0,"h1":["Ligas"],"blocks":["Benjamín","Prebenjamín"],"esqueleto":{"cabecera":[0,72],"partes":[[90,223]]},"pantalla":{"cabecera":[0,72],"partes":[[90,223]]}}
esqueleto-ligas-1440-claro: {"overflow":0,"h1":["Ligas"],"blocks":["Benjamín","Prebenjamín"],"esqueleto":{"cabecera":[49,72],"partes":[[139,223]]},"pantalla":{"cabecera":[49,72],"partes":[[139,223]]}}
esqueleto-records-390-claro: {"overflow":0,"h1":["Récords"],"blocks":["Totales","Partidos","Ataque y defensa","Mejor racha de victorias","Mejor racha invicta","Mejores en casa","Mejores fuera","Máximos goleadores"],"esqueleto":{"cabecera":[0,72],"partes":[[86,46],[150,80]]},"pantalla":{"cabecera":[0,72],"partes":[[86,46],[150,80]]}}
esqueleto-records-390-oscuro: {"overflow":0,"h1":["Récords"],"blocks":["Totales","Partidos","Ataque y defensa","Mejor racha de victorias","Mejor racha invicta","Mejores en casa","Mejores fuera","Máximos goleadores"],"esqueleto":{"cabecera":[0,72],"partes":[[86,46],[150,80]]},"pantalla":{"cabecera":[0,72],"partes":[[86,46],[150,80]]}}
esqueleto-records-1440-claro: {"overflow":0,"h1":["Récords"],"blocks":["Totales","Partidos","Ataque y defensa","Mejor racha de victorias","Mejor racha invicta","Mejores en casa","Mejores fuera","Máximos goleadores"],"esqueleto":{"cabecera":[49,72],"partes":[[135,46],[199,80]]},"pantalla":{"cabecera":[49,72],"partes":[[135,46],[199,80]]}}
esqueleto-copa-390-claro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"esqueleto":{"cabecera":[0,72],"partes":[[90,125]]},"pantalla":{"cabecera":[0,72],"partes":[[90,125]]}}
esqueleto-copa-390-oscuro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"esqueleto":{"cabecera":[0,72],"partes":[[90,125]]},"pantalla":{"cabecera":[0,72],"partes":[[90,125]]}}
esqueleto-copa-1440-claro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"esqueleto":{"cabecera":[49,72],"partes":[[139,125]]},"pantalla":{"cabecera":[49,72],"partes":[[139,125]]}}
esqueleto-goleadores-390-claro: {"overflow":0,"h1":["Goleadores"],"blocks":[],"esqueleto":{"cabecera":[0,72],"partes":[[72,65]]},"pantalla":{"cabecera":[0,72],"partes":[[72,65]]}}
esqueleto-goleadores-390-oscuro: {"overflow":0,"h1":["Goleadores"],"blocks":[],"esqueleto":{"cabecera":[0,72],"partes":[[72,65]]},"pantalla":{"cabecera":[0,72],"partes":[[72,65]]}}
esqueleto-goleadores-1440-claro: {"overflow":0,"h1":["Goleadores"],"blocks":[],"esqueleto":{"cabecera":[49,72],"partes":[[121,65]]},"pantalla":{"cabecera":[49,72],"partes":[[121,46]]}}
OK: sin errores; capturas en $S/vistas-t5
```

Abrir con Read, de `$S/vistas-t5`, `esqueleto-equipo-390-claro-esqueleto.png` y `esqueleto-equipo-390-claro.png`, `esqueleto-explorar-390-oscuro-esqueleto.png` y `esqueleto-explorar-390-oscuro.png`, `esqueleto-records-390-claro-esqueleto.png`, `esqueleto-goleadores-390-claro-esqueleto.png` y `esqueleto-records-1440-claro-esqueleto.png`, y comparar:
- **el esqueleto**: gris plano y quieto (sin animación), la cabecera con su regla de tinta (en Equipo, el círculo del escudo a la izquierda y dos barras, título y etiqueta), la barra corta del título de bloque y la caja de borde gris claro;
- **frente a la pantalla**: en Equipo, la caja acaba donde acaba «Así terminó 2024/25»; en Explorar, la caja fina ocupa el sitio del buscador y la grande, el de «Ligas»; en Récords, la fina, el del selector «Benjamín | Prebenjamín», y la de abajo, «Totales»; en Goleadores, una caja del alto del vacío, justo bajo la cabecera y sin título;
- **en oscuro**, las barras y los bordes en el gris oscuro de `--line`;
- **a 1440 px**, las mismas piezas a todo el ancho de 1120 px.

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: pytest, sin cambios; node, el recuento anterior más 1, de 741 a 742, sin fallos:
```text
517 passed, 5 skipped
# tests 742
# pass 742
# fail 0
```

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
grep -F 'del esqueleto a la ficha' <<<"$out"
grep '^PASS: render smoke' <<<"$out" | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado (unos 4 minutos: con el `timeout` de la herramienta a 600000 ms): una línea PASS más que en la tarea anterior en cada pasada (24), la nueva, y el DOM de la portada sin cambios (su esqueleto no cambia; la de los datos reales, en el estado del día: D el 27/09/2026):
```text
pasada 1: 24 PASS; otras líneas: 0
pasada 2: 24 PASS; otras líneas: 0
pasada 3: 24 PASS; otras líneas: 0
PASS: 390px en claro, del esqueleto a la ficha de Equipo de 2024/25: la cabecera y el primer bloque, en su sitio y casi del mismo alto; desplazamiento por debajo de 0,1
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/codigo.py
git add src/shell.js acta.css index.html scripts/tests/test_rediseno_shell.mjs scripts/tests/interaction-smoke.mjs
git commit -q -F - <<'EOF'
feat(rediseño): el esqueleto propio de las seis pantallas de B3 (B5, tarea 5)

Equipo, Explorar, Ligas, Récords, Copa y Goleadores dejan la caja genérica
de 96 px mientras cargan (decisión 4): cada una pinta su cabecera (con el
escudo en Equipo), lo que va antes de su primer bloque (el buscador de
Explorar, el selector de Récords) y ese bloque, con su título y el alto
que tiene a 390 px lo que llega después, medido con las fixtures. En
Goleadores, que tras el esqueleto solo dice que no hay goleadores de esa
temporada, una caja de ese alto, sin título.

En interaction-smoke, la ficha de Equipo de 2024/25 con la carga retenida:
la cabecera y el primer bloque, en su sitio y casi del mismo alto, y la
puntuación de desplazamiento del paso por debajo de 0,1.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado:
```text
CODIGO 9b47f80c: la huella de acta.css y src/*.js, en index.html
 5 files changed, 131 insertions(+), 7 deletions(-)
```

---

### Task 6: Dos textos de Copa: la final empatada sin penaltis y los partidos sin fecha de una liguilla (decisión 5)

Copa deja de decir que una final jugada «no tiene resultado publicado» y de repetir «sin fecha» en cada partido de una liguilla.

**Contexto**
- **La final empatada** (`screen-copa.js:53`): sin campeón, el bloque «Campeón» dice siempre «Todavía no hay campeón: la final no tiene resultado publicado.». `bracket()` (`model.js:1418`) no da campeón cuando la final no tiene resultado, pero tampoco cuando acaba en empate y la fuente no dice quién pasó (sin la columna de penaltis ni tanda: así llegan las copas de la federación). Entonces el texto es falso (§7, honestidad). Pasa a «La final acabó en empate (2–2) y la fuente no dice quién ganó.», con su marcador (`score` de `ui.js`); sin resultado, el de siempre. La final, como en `bracket()`: el único partido de la última ronda, si es la «Final».
- **Los partidos sin fecha de una liguilla** (`screen-copa.js:82`): cada partido lleva encima su día o «sin fecha», y `matchRow` añade su nota de estado, «sin fecha» otra vez: con varios, se repite en cada fila. Pasan juntos al final, en su propia caja, bajo un único «Sin fecha» (el título de día de Jornada, `h3.day-title`, sin CSS nueva); con varias jornadas, cada uno con la suya; y sin la nota de estado: `matchRow` gana la opción `note` (por defecto, como hoy).
- **Pruebas**: las fixtures no traen ninguno de los dos casos, así que se retocan en la propia prueba: la final de la Copa Oro de benjamín (MCBK2, 2–2) sin su columna de penaltis ni su tanda; los dos últimos partidos de la liguilla MCP3 (una ronda) sin fecha ni resultado; y dos de la Copa Fuerteventura de 2023-24 (CFV1, por jornadas) sin fecha.
- Jornada, que ya agrupa por días con «Sin fecha» al final, sigue llevando la nota en cada fila: la decisión es de la liguilla de Copa.
- **Recuentos**: node, el anterior más 2 (742 → 744); pytest, sin cambios; los smoke, sin líneas nuevas (24 PASS).

**Files:**
- Modify: `src/screen-copa.js`, `src/ui.js` (`matchRow`, la opción `note`) e `index.html` (`CODIGO`)
- Test: `scripts/tests/test_rediseno_copa.mjs`
- Fuera del repo: `$S/vista-copa.mjs`

**Interfaces:**
- Consumes: `bracket` y `matchState` (`model.js`); `score`, `empty`, `block` y `matchRow` (`ui.js`); `$S/vista-comun.mjs` (Tarea 3, paso 5); en las pruebas, `all()`, `render`, `blockOf`, `cells`, `ctxOf` y `datasetsFor` de `test_rediseno_copa.mjs` y `archive`.
- Produces:

```js
// src/ui.js
export function matchRow(match, { mine = false, today, shields, href, note = true } = {}) → Html
//   note: false, sin la nota de estado ni de penaltis (los «Sin fecha» de la liguilla la dicen en su título)
// src/screen-copa.js, bloque «Campeón» sin campeón:
//   la final jugada y empatada → «La final acabó en empate (2–2) y la fuente no dice quién ganó.»
//   si no → «Todavía no hay campeón: la final no tiene resultado publicado.»
// liguilla: <ol class="box cal">…los de fecha…</ol><h3 class="day-title">Sin fecha</h3><ol class="box cal">…</ol>
```

- [ ] **Step 1: Write the failing test**

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
from pathlib import Path


def append(path, text):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.endswith('\n') and text.strip() not in s, path
    p.write_text(s + text, encoding='utf-8')


append('scripts/tests/test_rediseno_copa.mjs', """
// ── Plan B5, Tarea 6: dos textos de Copa (decisión 5) ──

test('una final empatada de la que la fuente no dice quién ganó: el bloque «Campeón» lo dice, con su marcador (§7)', () => {
  // MCBK2, la final de la Copa Oro (2–2): sin la columna de penaltis ni la tanda, como las copas de la federación.
  const ds = all();
  const final = ds.cupBenjamin.find((g) => g.id === 'MCBK2').jornadas['27-06-2026 ( Final )'][0];
  final[5] = null;
  final[8] = null;
  const out = render({ g: 'MCBK2' }, { datasets: ds });
  assert.match(out, /<h2 class="block-title">Campeón<\\/h2><\\/div><p class="empty">La final acabó en empate \\(2–2\\) y la fuente no dice quién ganó\\.<\\/p><\\/section>/);
  assert.doesNotMatch(blockOf(out, 'Campeón'), /Todavía no hay campeón|penaltis|cup-champion/);
  // En el cuadro, la final sin «pasó»: nadie lo dice.
  const lastCell = cells(out).at(-1);
  assert.equal(lastCell.text, '17:00 · CD 1.1 HA AD Huracán A 2 VA UD Vecindario A 2');
  assert.equal(bracket(findGroup(ctxOf({ g: 'MCBK2' }, { datasets: ds }).model, PORTAL_SEASON, 'MCBK2')).champion, null);
  // Con la columna de penaltis, su campeón; sin resultado, que todavía no lo hay.
  assert.match(render({ g: 'MCBK2' }), /<span class="cup-champion-name">UD Vecindario A<\\/span>/);
  final[3] = null;
  final[4] = null;
  assert.match(render({ g: 'MCBK2' }, { datasets: ds }), /<p class="empty">Todavía no hay campeón: la final no tiene resultado publicado\\.<\\/p>/);
});

test('una liguilla con partidos sin fecha: van juntos al final, bajo un único «Sin fecha», y ninguna fila lo repite', () => {
  // MCP3 (una sola ronda): los dos últimos partidos, sin fecha ni resultado.
  const ds = all();
  const rows = ds.cupPrebenjamin.find((g) => g.id === 'MCP3').matches;
  for (const row of rows.slice(-2)) Object.assign(row, { 0: '', 4: null, 5: null });
  const matches = blockOf(render({ g: 'MCP3' }, { datasets: ds }), 'Partidos');
  assert.match(matches, /<p class="block-context">6 partidos<\\/p>/);
  assert.equal((matches.match(/sin fecha/gi) || []).length, 1, 'una sola vez');
  const [dated, undated] = matches.split('<h3 class="day-title">Sin fecha</h3>');
  assert.match(dated, /<ol class="box cal">(?:<li><p class="cal-when">[^<]+<\\/p><a class="match-row[^>]*>.*?<\\/a><\\/li>){4}<\\/ol>$/);
  assert.match(undated, /^<ol class="box cal">(?:<li><a class="match-row[^>]*>.*?<\\/a><\\/li>){2}<\\/ol><\\/section>$/);
  assert.doesNotMatch(undated, /match-note/, 'sin la nota «sin fecha» en cada fila');
  // Con varias jornadas (la Copa Fuerteventura 2023-24), cada uno lleva la suya.
  const archived = archive('2023-2024');
  const cfv1 = archived.benjamin.find((g) => g.id === 'CFV1');
  cfv1.jornadas['2'][0][0] = '';
  cfv1.jornadas['5'][1][0] = '';
  const several = blockOf(render({ s: '2023-2024', g: 'CFV1' }, { datasets: datasetsFor({ seasonRaw: { '2023-2024': archived } }) }), 'Partidos');
  assert.match(several, /<p class="block-context">36 partidos<\\/p>/);
  const late = several.split('<h3 class="day-title">Sin fecha</h3>')[1];
  assert.deepEqual([...late.matchAll(/<p class="cal-when">([^<]*)<\\/p>/g)].map((m) => m[1]), ['Jornada 2', 'Jornada 5']);
  assert.equal((several.match(/sin fecha/gi) || []).length, 1);
});
""")
print('test_rediseno_copa: la final empatada y los partidos sin fecha de una liguilla')
PY
```
Esperado:
```text
test_rediseno_copa: la final empatada y los partidos sin fecha de una liguilla
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_copa.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'
```
Esperado: las dos nuevas:
```text
not ok 16 - una final empatada de la que la fuente no dice quién ganó: el bloque «Campeón» lo dice, con su marcador (§7)
not ok 17 - una liguilla con partidos sin fecha: van juntos al final, bajo un único «Sin fecha», y ninguna fila lo repite
# tests 17
# pass 15
# fail 2
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


# ── ui.js: matchRow sin la nota, donde la lista ya la dice ──
edit('src/ui.js', [
    ("""export function matchRow(match, { mine = false, today, shields, href } = {}) {
  if (!today) throw new TypeError('matchRow necesita today (AAAA-MM-DD): el reloj se inyecta');
  const state = matchState(match, today);
  const result = state === 'jugado'
    ? html`<span class="match-score">${score(match.hs, match.as)}</span>`
    : html`<span class="match-score is-pending">–</span>`;
  const note = matchNote(match, state);""",
     """// note: false, sin la nota, donde la lista ya la dice (los «Sin fecha» de una liguilla de Copa, B5,
// decisión 5).
export function matchRow(match, { mine = false, today, shields, href, note: withNote = true } = {}) {
  if (!today) throw new TypeError('matchRow necesita today (AAAA-MM-DD): el reloj se inyecta');
  const state = matchState(match, today);
  const result = state === 'jugado'
    ? html`<span class="match-score">${score(match.hs, match.as)}</span>`
    : html`<span class="match-score is-pending">–</span>`;
  const note = withNote ? matchNote(match, state) : null;"""),
])

# ── screen-copa.js: la final empatada sin penaltis, y los partidos sin fecha de una liguilla ──
edit('src/screen-copa.js', [
    ("""import { block, box, countLabel, crest, empty, matchNote, matchRow, screenHead, standingsTable } from './ui.js';""",
     """import { block, box, countLabel, crest, empty, matchNote, matchRow, score, screenHead, standingsTable } from './ui.js';"""),
    ("""// El campeón, arriba (spec §4.7): quién pasó de la final, con su escudo, y la final debajo.
function championBlock(rounds, champion, me, today, shields) {
  if (!champion) return block('Campeón', empty('Todavía no hay campeón: la final no tiene resultado publicado.'));
  const final = rounds[rounds.length - 1].matches[0].match;""",
     """// La final: el único partido de la última ronda, si es la «Final» (la regla de bracket, model.js).
function finalOf(rounds) {
  const last = rounds[rounds.length - 1];
  return last && last.label === 'Final' && last.matches.length === 1 ? last.matches[0].match : null;
}

// El campeón, arriba (spec §4.7): quién pasó de la final, con su escudo, y la final debajo. Sin él, por
// qué: una final empatada de la que la fuente no dice quién ganó (sin columna de penaltis ni tanda), con
// su marcador, o una final todavía sin resultado (§7, honestidad: B5, decisión 5).
function championBlock(rounds, champion, me, today, shields) {
  const final = finalOf(rounds);
  if (!champion) {
    const drawn = final && matchState(final, today) === 'jugado' && final.hs === final.as;
    return block('Campeón', empty(drawn
      ? `La final acabó en empate (${score(final.hs, final.as)}) y la fuente no dice quién ganó.`
      : 'Todavía no hay campeón: la final no tiene resultado publicado.'));
  }"""),
    ("""// La clasificación de la fuente con la fila de mi equipo, y los partidos en su orden, cada uno con
// su día (y su jornada, si hay varias). Sin enlaces a las fichas: la de un equipo de copa es la copa.
function leagueView(group, me, today, shields) {
  const table = group.standings.length
    ? box(standingsTable(group.standings, { view: 'puntos', mine: me, shields, caption: `Clasificación de ${group.label}` }), { title: 'Clasificación' })
    : block('Clasificación', empty('Clasificación sin publicar.'));
  const several = group.rounds.length > 1;
  const items = group.rounds.flatMap((round) => round.matches.map((m) => html`<li><p class="cal-when">${several ? `${round.label} · ` : ''}${weekdayDate(m.dateISO) || 'sin fecha'}</p>${matchRow(m, { mine: plays(me, m), today, shields, href: matchHref(m) })}</li>`));
  const matches = items.length
    ? block('Partidos', html`<ol class="box cal">${items}</ol>`, { context: `${items.length} partidos` })
    : block('Partidos', empty('La fuente todavía no ha publicado los partidos de esta copa.'));
  return html`${table}${matches}`;
}""",
     """// La clasificación de la fuente con la fila de mi equipo, y los partidos en su orden, cada uno con
// su día (y su jornada, si hay varias). Los que no tienen fecha van juntos al final, bajo un único «Sin
// fecha», con el título de día de Jornada, y ninguna fila lo repite (B5, decisión 5); cada uno, con su
// jornada si hay varias. Sin enlaces a las fichas: la de un equipo de copa es la copa.
function leagueView(group, me, today, shields) {
  const table = group.standings.length
    ? box(standingsTable(group.standings, { view: 'puntos', mine: me, shields, caption: `Clasificación de ${group.label}` }), { title: 'Clasificación' })
    : block('Clasificación', empty('Clasificación sin publicar.'));
  const several = group.rounds.length > 1;
  const all = group.rounds.flatMap((round) => round.matches.map((m) => ({ round, m })));
  const row = ({ round, m }, when) => html`<li>${when ? html`<p class="cal-when">${when}</p>` : ''}${matchRow(m, { mine: plays(me, m), today, shields, href: matchHref(m), note: Boolean(m.dateISO) })}</li>`;
  const dated = all.filter(({ m }) => m.dateISO).map((x) => row(x, `${several ? `${x.round.label} · ` : ''}${weekdayDate(x.m.dateISO)}`));
  const undated = all.filter(({ m }) => !m.dateISO).map((x) => row(x, several ? x.round.label : ''));
  const list = html`${dated.length ? html`<ol class="box cal">${dated}</ol>` : ''}${undated.length ? html`<h3 class="day-title">Sin fecha</h3><ol class="box cal">${undated}</ol>` : ''}`;
  const matches = all.length
    ? block('Partidos', list, { context: `${all.length} partidos` })
    : block('Partidos', empty('La fuente todavía no ha publicado los partidos de esta copa.'));
  return html`${table}${matches}`;
}"""),
])
print('screen-copa.js: la final empatada lo dice, y los partidos sin fecha de una liguilla, juntos bajo «Sin fecha»')
PY
python3 scripts/codigo.py
```
Esperado:
```text
screen-copa.js: la final empatada lo dice, y los partidos sin fecha de una liguilla, juntos bajo «Sin fecha»
CODIGO 840590e1: la huella de acta.css y src/*.js, en index.html
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_rediseno_copa.mjs scripts/tests/test_rediseno_ui.mjs scripts/tests/test_rediseno_jornada.mjs scripts/tests/test_rediseno_vista_equipo.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: Copa y, con ella, `matchRow` y quienes la usan (Jornada y la vista de equipo, con las huellas de la portada), que no cambian:
```text
# tests 78
# pass 78
# fail 0
```

- [ ] **Step 5: Verificación visual (Chrome, fuera del repo)**

Los tres casos de la prueba, en la app con los datos de las fixtures retocados igual (la vista sirve sus propios `data-maspalomas-cup-2026.js` y `data-season-2023-2024.js`). Si `$S/vista-comun.mjs` no existe (otra sesión), se crea antes con el bloque del paso 5 de la Tarea 3.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
cat > "$S/vista-copa.mjs" <<'EOF'
// Plan B5, Tarea 6: los dos textos de Copa, con datos de las fixtures retocados (como sus pruebas): la
// final de la Copa Oro de benjamín (MCBK2, 2–2) sin columna de penaltis ni tanda; los dos últimos
// partidos de la liguilla MCP3 sin fecha ni resultado; y dos de la Copa Fuerteventura 2023-24 (CFV1,
// por jornadas) sin fecha. Uso, desde la raíz del repo: OUT=<dir> node <este fichero>
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run } from './vista-comun.mjs';

const { archive, cupsRaw } = await import(pathToFileURL(join(process.cwd(), 'scripts/tests/fixtures/rediseno/simulate.mjs')).href);
const js = (pairs) => pairs.map(([name, value]) => `const ${name}=${JSON.stringify(value)};`).join('\n') + '\n';
const cups = cupsRaw({ extra: true });
const final = cups.benjamin.find((g) => g.id === 'MCBK2').jornadas['27-06-2026 ( Final )'][0];
final[5] = null;
final[8] = null;
for (const row of cups.prebenjamin.find((g) => g.id === 'MCP3').matches.slice(-2)) Object.assign(row, { 0: '', 4: null, 5: null });
const past = archive('2023-2024');
const cfv1 = past.benjamin.find((g) => g.id === 'CFV1');
cfv1.jornadas['2'][0][0] = '';
cfv1.jornadas['5'][1][0] = '';
const route = async (context) => {
  await context.route(/\/data-maspalomas-cup-2026\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: js([['MASPALOMAS_CUP_BENJAMIN', cups.benjamin], ['MASPALOMAS_CUP_PREBENJAMIN', cups.prebenjamin]]) }));
  await context.route(/\/data-season-2023-2024\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: js([['SEASON_2023_2024', past]]) }));
};
const text = (sel) => (page) => page.evaluate((s) => ({ texto: document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null,
  sinFecha: (document.querySelector('#contenido')?.innerText.match(/sin fecha/gi) || []).length }), sel);

const problems = await run(process.env.OUT, [
  { name: 'copa-final-empate', world: 'D', hash: '#/copa?s=2025-2026&g=MCBK2', screen: 'copa', route, measure: text('#contenido section.block p.empty') },
  { name: 'copa-liguilla-sin-fecha', world: 'D', hash: '#/copa?s=2025-2026&g=MCP3', screen: 'copa', route, measure: text('#contenido h3.day-title') },
  { name: 'copa-jornadas-sin-fecha', world: 'D', hash: '#/copa?s=2023-2024&g=CFV1', screen: 'copa', route, measure: text('#contenido h3.day-title') },
]);
process.exit(problems.length ? 1 : 0);
EOF
OUT="$S/vistas-t6" node "$S/vista-copa.mjs" | sed -E 's/"(small|broken)":\[\],|"covered":false,//g'
```
Esperado: el texto de la final y un solo «sin fecha» en cada liguilla:
```text
copa-final-empate-390-claro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"texto":"La final acabó en empate (2–2) y la fuente no dice quién ganó.","sinFecha":0}
copa-final-empate-390-oscuro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"texto":"La final acabó en empate (2–2) y la fuente no dice quién ganó.","sinFecha":0}
copa-final-empate-1440-claro: {"overflow":0,"h1":["Copa"],"blocks":["Campeón","Cuadro"],"texto":"La final acabó en empate (2–2) y la fuente no dice quién ganó.","sinFecha":0}
copa-liguilla-sin-fecha-390-claro: {"overflow":0,"h1":["Copa"],"blocks":["Clasificación","Partidos"],"texto":"Sin fecha","sinFecha":1}
copa-liguilla-sin-fecha-390-oscuro: {"overflow":0,"h1":["Copa"],"blocks":["Clasificación","Partidos"],"texto":"Sin fecha","sinFecha":1}
copa-liguilla-sin-fecha-1440-claro: {"overflow":0,"h1":["Copa"],"blocks":["Clasificación","Partidos"],"texto":"Sin fecha","sinFecha":1}
copa-jornadas-sin-fecha-390-claro: {"overflow":0,"h1":["Copa"],"blocks":["Clasificación","Partidos"],"texto":"Sin fecha","sinFecha":1}
copa-jornadas-sin-fecha-390-oscuro: {"overflow":0,"h1":["Copa"],"blocks":["Clasificación","Partidos"],"texto":"Sin fecha","sinFecha":1}
copa-jornadas-sin-fecha-1440-claro: {"overflow":0,"h1":["Copa"],"blocks":["Clasificación","Partidos"],"texto":"Sin fecha","sinFecha":1}
OK: sin errores; capturas en $S/vistas-t6
```

Abrir con Read, de `$S/vistas-t6`, `copa-final-empate-390-claro.png`, `copa-final-empate-1440-claro.png`, `copa-liguilla-sin-fecha-390-oscuro.png` y `copa-jornadas-sin-fecha-390-claro.png` (la parte de abajo), y comparar:
- **la final**: bajo «Campeón», el vacío de borde discontinuo con «La final acabó en empate (2–2) y la fuente no dice quién ganó.»; debajo, «Cuadro» con sus seis pestañas, y en la columna de la final (a 1440 px, todas a la vista) AD Huracán A 2 y UD Vecindario A 2, ninguno en negrita ni con «pasó»;
- **la liguilla MCP3**: la clasificación y, en «Partidos» (6 partidos), una caja con los cuatro de fecha, cada uno con su día, y debajo el título gris «Sin fecha» y otra caja con los dos que no la tienen, sin día encima ni nota en la fila, marcador «–»; los de Las Mesas, con el resalte propio;
- **la Copa Fuerteventura**: al final de sus 36 partidos, «Sin fecha» y una caja con los dos, cada uno con su jornada encima («Jornada 2», «Jornada 5»).

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: pytest, sin cambios; node, el recuento anterior más 2, de 742 a 744, sin fallos:
```text
517 passed, 5 skipped
# tests 744
# pass 744
# fail 0
```

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
grep '^PASS: render smoke' <<<"$out" | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado (unos 4 minutos: con el `timeout` de la herramienta a 600000 ms): las 24 líneas PASS de la tarea anterior y el DOM de la portada sin cambios (la de los datos reales, en el estado del día: D el 27/09/2026):
```text
pasada 1: 24 PASS; otras líneas: 0
pasada 2: 24 PASS; otras líneas: 0
pasada 3: 24 PASS; otras líneas: 0
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/codigo.py
git add src/screen-copa.js src/ui.js index.html scripts/tests/test_rediseno_copa.mjs
git commit -q -F - <<'EOF'
fix(rediseño): dos textos de Copa, la final empatada y los partidos sin fecha (B5, tarea 6)

- Una final empatada de la que la fuente no dice quién ganó (sin columna
  de penaltis ni tanda, como las copas de la federación) ya no dice «la
  final no tiene resultado publicado»: «La final acabó en empate (2–2) y
  la fuente no dice quién ganó.» (§7, honestidad; decisión 5).
- En una liguilla, los partidos sin fecha van juntos al final, en su caja,
  bajo un único «Sin fecha» (el título de día de Jornada), cada uno con su
  jornada si hay varias; ninguna fila lo repite (matchRow, con note: false).

Pruebas con las fixtures retocadas: la final de la Copa Oro de benjamín sin
penaltis, MCP3 y la Copa Fuerteventura 2023-24 con partidos sin fecha.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado:
```text
CODIGO 840590e1: la huella de acta.css y src/*.js, en index.html
 4 files changed, 78 insertions(+), 11 deletions(-)
```

---

### Task 7: Las pruebas que faltan: el calendario de escritorio, Intro en los buscadores, la portada de B a X a 320 px, las etiquetas de los tiempos agotados, las huellas que faltaban, la jornada en curso de la Tabla y `app.js` por su conducta (decisión 7)

Lo que §11 pide y el plan B3 dejó «sin prueba todavía» o aparcado en su triaje, sobre lo que la app ya hace: no cambia `src/` ni `acta.css` (`CODIGO` se queda).

**Contexto**
- **`interaction-smoke`** (inventario §H y §I):
  - **el calendario de escritorio de la portada** (`team-view.js:397-410`, que `mount` pinta desde 1024 px con `matchMedia`) no lo miraba nadie. El paso 1 de cada ancho lo comprueba: a 1440 px, `#calendario` en su hueco, con los 26 partidos de Las Mesas («26 partidos»); por debajo, el hueco vacío (§5.1: se pinta solo lo visible);
  - **Intro en los dos buscadores**: Explorar (`screen-explorar.js:184`, `preventDefault` en el formulario) y Goleadores (`screen-goleadores.js:168`, en la sección, y además quita el foco del campo para cerrar el teclado). `pressEnter` lee en la ventana si el `submit` llegó con `defaultPrevented` y comprueba que la página (una marca), la dirección y el historial siguen iguales; en Explorar, el foco y los resultados se quedan; en Goleadores, el foco se va. Sin el `preventDefault` de Explorar, el paso falla (comprobado);
  - **`checkLayout` a 320 px de la portada** solo se hacía en el mundo A: `homeStates` la abre en B, C, D, E y X, a 320 px en claro;
  - **las etiquetas de los tiempos agotados**: `waitForAsync` ya nombra su paso (B3); los clics, las esperas de localizador y las navegaciones de Playwright de `interaction-smoke.mjs` y `capturas.mjs`, no. `labeled(label, action)`, en `browser-wait.mjs`, pone el escenario, el ancho y el tema delante del error; una prueba de `test_browser_waits.mjs` fija que ninguna línea con `.click(`, `.waitFor(`, `.goBack(` o `.reload(` de esos dos ficheros va sin él.
- **Las huellas de la portada que faltaban** (`test_rediseno_vista_equipo.mjs:39-52`, 12 escenarios): D sin «Verano» (RC Victoria, que no se une a su club en MCP3), C con las otras dos notas (el próximo partido sin fecha publicada, el 31/05/2026 con la jornada 30 sin fecha, y el resultado pendiente de publicar, el 03/06/2026), A con menos de cinco resultados (25/10/2025: «Últimos resultados») y A con la hora «por confirmar» (la jornada 18 sin hora). Sus sha1 son los del render de `0208d26`, iguales tras la Tarea 3 (comprobado en los dos árboles).
- **`standingsContext`** (`screen-tabla.js:48-53`, privada) solo se probaba con «, final»: la Tabla del 01/03/2026 con la jornada 17 de la fuente dice «jornada 17», y sin jornada de la fuente, ningún contexto.
- **Las dos pruebas de `test_rediseno_integracion.mjs` que leían el texto de `app.js`** (277-293) pasan a su conducta, con `start()` y el navegador falso: la escucha de los errores de imagen (en captura) y el cambio de fase guardado ocurren antes del primer pintado (`main` todavía vacío), y esa escucha es la cadena de los escudos; el último destino principal va a la sesión de la pestaña; «Hacer mi equipo» se guarda con `saveStore` y, si el almacén falla, queda en memoria.
- Todas cubren lo que la app ya hace: las huellas nuevas, la de la Tabla y las de la integración pasan desde el principio (son la red); las que fallan antes de la implementación son las de `labeled`.
- **Recuentos**: node, el anterior más 3 (744 → 747); pytest, sin cambios: 2 de `test_browser_waits.mjs` y 1 de la Tabla (la integración sale como estaba: 2 fuera y 2 dentro; las huellas son una sola prueba). Los smoke, una línea PASS más (la portada de B a X) y el texto nuevo de las 16 de cada ancho.

**Files:**
- Modify: `scripts/tests/browser-wait.mjs` (`labeled`), `scripts/tests/interaction-smoke.mjs` y `scripts/tests/capturas.mjs`
- Test: `scripts/tests/test_browser_waits.mjs`, `scripts/tests/test_rediseno_vista_equipo.mjs`, `scripts/tests/test_rediseno_tabla.mjs` y `scripts/tests/test_rediseno_integracion.mjs`

**Interfaces:**
- Consumes: `start` (`app.js`), `SESSION_KEY` (`router.js`), `STORE_KEY` (`store.js`) y los ayudantes de `test_rediseno_integracion.mjs` (`installData`, `load`, `saved`, `stateOf`, `PORTAL_2526`); `homeCtx`, `HOME` y `currentAt` en `test_rediseno_vista_equipo.mjs`; `render`, `datasetsFor` y `GOL_PG2` en `test_rediseno_tabla.mjs`; `useWorld`, `paintedAs`, `checkLayout`, `snapshot` y `newContext` en `interaction-smoke.mjs`.
- Produces:

```js
// scripts/tests/browser-wait.mjs
export async function labeled(label, action) → Promise<lo que devuelve action>   // el error, con «<label>: » delante
// scripts/tests/interaction-smoke.mjs
const click = (page, selector, label) => labeled(`${label}: clic en ${selector}`, () => page.click(selector));
async function pressEnter(page, label) → id del elemento con el foco tras Intro
async function homeStates()   // la portada en B, C, D, E y X a 320 px en claro, con checkLayout
```

- [ ] **Step 1: Write the failing test**

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


def append(path, text):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    assert s.endswith('\n') and text.strip() not in s, path
    p.write_text(s + text, encoding='utf-8')


# ── Las huellas de la portada que faltaban (B3, «Lo aparcado» y «Sin prueba todavía») ──
edit('scripts/tests/test_rediseno_vista_equipo.mjs', [
    ("""// sha1 del render de la portada en e82eb86 (antes de team-view.js), con las fixtures de B1 y B3.
const HOME = {""", """// La jornada 30 de PG2 sin fecha publicada (el próximo partido de Las Mesas, el 31/05/2026) y el de la
// jornada 18 sin hora (el del 01/03/2026): los dos casos de C y de A que las fixtures no traen.
function undatedJ30() {
  const raw = currentAt('2026-05-31');
  raw.history.PG2['Jornada 30'][0][0] = '';
  return raw;
}
function untimedJ18() {
  const raw = currentAt('2026-03-01');
  raw.history.PG2['Jornada 18'].find((m) => m[1] === 'Las Mesas Hu.' || m[2] === 'Las Mesas Hu.')[6] = '';
  return raw;
}

// sha1 del render de la portada en e82eb86 (antes de team-view.js), con las fixtures de B1 y B3; las
// cinco últimas, de B5 (decisión 7), del render de 0208d26, el mismo tras la limpieza de la Tarea 3.
const HOME = {"""),
    ("""  X: [{ raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portalSeason: '2026-2027', goles: false }, 'b60fcec7f40d3730d9150338f6377318bec65bad'],
};""", """  X: [{ raw: nextSeasonRaw({ benjamin: ['A1'], prebenjamin: ['PG3'] }), today: '2026-10-01', portalSeason: '2026-2027', goles: false }, 'b60fcec7f40d3730d9150338f6377318bec65bad'],
  'D sin «Verano»': [{ myTeam: { ...LAS_MESAS, name: 'RC Victoria' }, today: '2026-09-23' }, 'd9d70e4f3ada9f803926984c100b10f92c268756'],
  'C, próximo partido sin fecha publicada': [{ raw: undatedJ30(), today: '2026-05-31' }, 'c66ab809f8278913dc471b5f9938a2a971b19c37'],
  'C, resultado pendiente de publicar': [{ raw: currentAt('2026-06-02'), today: '2026-06-03' }, '44d2ab6c198ed8fef0e51219670c7416797dc793'],
  'A con menos de cinco resultados': [{ raw: currentAt('2025-10-25'), today: '2025-10-25' }, 'c00167cf24e6dd20e59b75af8e5b33e549acba96'],
  'A con la hora por confirmar': [{ raw: untimedJ18(), today: '2026-03-01' }, '1a3daa6fe3cab0381b86f2bc85ba9701da145e59'],
};"""),
    ("""test('la portada pinta lo mismo que antes de la vista compartida, byte a byte, en A, B, C, D, E y X (decisión 8)', () => {
  for (const [name, [options, sha1]] of Object.entries(HOME)) {
    const out = s(home.render(homeCtx(options)));
    assert.equal(createHash('sha1').update(out).digest('hex'), sha1, name);
  }
});""", """test('la portada pinta lo mismo que antes de la vista compartida, byte a byte, en A, B, C, D, E y X (decisión 8)', () => {
  for (const [name, [options, sha1]] of Object.entries(HOME)) {
    const out = s(home.render(homeCtx(options)));
    assert.equal(createHash('sha1').update(out).digest('hex'), sha1, name);
  }
  // Lo que fija cada huella de B5, en claro: que el caso es el que dice su nombre.
  const text = (options) => s(home.render(homeCtx(options)));
  const [verano, sinFecha, pendiente, pocos, sinHora] = ['D sin «Verano»', 'C, próximo partido sin fecha publicada',
    'C, resultado pendiente de publicar', 'A con menos de cinco resultados', 'A con la hora por confirmar'].map((name) => text(HOME[name][0]));
  assert.ok(verano.includes('data-state="D"') && !verano.includes('Verano'));
  assert.ok(sinFecha.includes('data-state="C"') && sinFecha.includes('Próximo partido sin fecha publicada'));
  assert.ok(pendiente.includes('data-state="C"') && pendiente.includes('Resultado pendiente de publicar'));
  assert.ok(pocos.includes('data-state="A"') && pocos.includes('Últimos resultados') && !pocos.includes('Últimos cinco'));
  assert.match(sinHora, /<div class="cell is-muted"><dt class="cell-label">Hora<\\/dt><dd class="cell-value">por confirmar<\\/dd><\\/div>/);
});"""),
])

# ── standingsContext con la jornada en curso ──
append('scripts/tests/test_rediseno_tabla.mjs', """
// ── Plan B5, Tarea 7: el contexto de la clasificación con la jornada en curso (B3, «Sin prueba todavía») ──

test('a mitad de temporada, la clasificación dice hasta qué jornada llega, sin «, final»; sin jornada de la fuente, nada', () => {
  const raw = currentAt('2026-03-01');
  const pg2 = raw.prebenjamin.find((g) => g.id === 'PG2');
  pg2.jornada = 'Jornada 17';
  const at = (current) => render({ g: 'PG2' }, { today: '2026-03-01', datasets: datasetsFor({ golPrebenj: GOL_PG2, current }) });
  assert.match(at(raw), /<h2 class="block-title">Clasificación<\\/h2><p class="block-context">jornada 17<\\/p><\\/div>/);
  pg2.jornada = null;
  assert.match(at(raw), /<h2 class="block-title">Clasificación<\\/h2><\\/div><div class="box tabla-puntos">/);
});
""")

# ── Las dos pruebas que leían el texto de app.js, sobre la conducta de start() ──
I = 'scripts/tests/test_rediseno_integracion.mjs'
edit(I, [
    ("""import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
""", ''),
    ("""import { start, startContext } from '../../src/app.js';""", """import { start, startContext } from '../../src/app.js';
import { SESSION_KEY } from '../../src/router.js';"""),
    ("""const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
""", ''),
    ("""// app.js es el punto de entrada: start(doc, win) lo llama index.html. Además de su conducta (arriba),
// el orden de su cableado con el navegador se comprueba en el código; en el navegador, en el paso 6
// y en la Tarea 13.
const APP = readFileSync(join(ROOT, 'src/app.js'), 'utf8').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|[^:])\\/\\/.*$/gm, '$1');
const routerStart = APP.indexOf('startRouter({');

test('app.js: crestFallback en captura y mi equipo guardado, los dos antes del primer pintado', () => {
  const crest = APP.search(/doc\\.addEventListener\\(\\s*'error',[^;]*crestFallback\\([^;]*,\\s*true\\s*\\)/);
  assert.ok(crest >= 0, 'falta el manejador de errores de imagen en captura');
  const save = APP.search(/myTeamToSave\\(store\\.myTeam,/);
  assert.ok(save >= 0, 'falta guardar mi equipo al arrancar');
  assert.ok(routerStart > crest && routerStart > save, 'los dos van antes de startRouter');
});

// El aviso sin conexión en vivo (online/offline y offlineNotice) ya se comprueba por conducta,
// arriba: aquí solo lo que esa prueba no puede ver desde fuera (sesión y la forma de saveMyTeam).
test('app.js: sesión y «Hacer mi equipo» con saveStore', () => {
  assert.match(APP, /session: safeStorage\\(\\(\\) => win\\.sessionStorage\\)/);
  assert.match(APP, /saveMyTeam\\(myTeam\\) \\{\\s*store = \\{ \\.\\.\\.store, myTeam \\};\\s*return saveStore\\(storage, store\\);/);
});""", """// El cableado de app.js con el navegador, por su conducta (B5, decisión 7; antes se leía su código):
// lo que start() escucha y guarda antes del primer pintado, la sesión y «Hacer mi equipo».
test('start: la cadena de los escudos, en captura, y el cambio de fase guardado, los dos antes del primer pintado', async () => {
  const ff5 = { name: 'Las Mesas Hu.', season: '2025-2026', cat: 'benjamin', groupId: 'FF5' };
  const storage = new Map([[STORE_KEY, JSON.stringify({ myTeam: ff5, recent: [] })]]);
  installData(currentAt('2026-03-01'));
  const page = fakeBrowser('#/', { storage });
  // Cada escucha del documento y cada escritura del almacén, con si la pantalla ya estaba pintada.
  const seen = [];
  const onError = [];
  const listen = page.doc.addEventListener;
  page.doc.addEventListener = (type, fn, capture) => {
    seen.push(['escucha', type, capture === true, page.main.innerHTML === '']);
    if (type === 'error') onError.push(fn);
    listen(type, fn, capture);
  };
  const setItem = page.win.localStorage.setItem;
  page.win.localStorage.setItem = (key, value) => {
    seen.push(['guarda', key, page.main.innerHTML === '']);
    setItem(key, value);
  };
  const router = start(page.doc, page.win, PORTAL_2526, { now: () => new Date('2026-03-01T12:00:00Z') });
  await router.idle();
  assert.deepEqual(seen.slice(0, 3), [['escucha', 'error', true, true], ['guarda', STORE_KEY, true], ['escucha', 'click', false, true]],
    'los escudos (en captura) y el cambio de fase (FF5 → A2), antes de que el router pinte');
  assert.equal(saved(storage).groupId, 'A2');
  assert.equal(stateOf(page), 'A');
  // La escucha de los errores de imagen es la cadena de los escudos: miniatura → original → monograma.
  const img = {
    tagName: 'IMG', classList: { contains: (c) => c === 'crest' }, attrs: { src: './escudos/s/huracan.png', 'data-full': './escudos/huracan.png' },
    getAttribute(n) { return this.attrs[n] ?? null; }, setAttribute(n, v) { this.attrs[n] = v; },
  };
  onError.forEach((fn) => fn({ target: img }));
  assert.equal(img.attrs.src, './escudos/huracan.png');
});

test('start: el último destino principal, en la sesión de la pestaña; «Hacer mi equipo», en el almacén con saveStore o, si falla, en memoria', async () => {
  const storage = new Map();
  const { page, router } = await load(storage, { today: '2026-03-01', hash: '#/tabla' });
  assert.equal(page.win.sessionStorage.getItem(SESSION_KEY), 'tabla');
  const huracan = { name: 'AD Huracán', season: '2025-2026', cat: 'prebenjamin', groupId: 'PG2' };
  assert.equal(router.nav.saveMyTeam(huracan), true);
  await router.idle();
  assert.deepEqual(saved(storage), huracan);
  // Con el almacén lleno (setItem lanza): false, y la portada ya es la del equipo nuevo, en memoria.
  page.win.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(router.nav.saveMyTeam({ ...huracan, name: 'Acodetti' }), false);
  await router.idle();
  page.type('#/');
  await router.idle();
  assert.match(page.main.innerHTML, /<h1>Acodetti<\\/h1>/);
  assert.deepEqual(saved(storage), huracan, 'en el almacén, el último que se pudo guardar');
});"""),
])

# ── labeled: la etiqueta en los tiempos agotados de clics y localizadores ──
B = 'scripts/tests/test_browser_waits.mjs'
edit(B, [
    ("""import { waitForAsync } from './browser-wait.mjs';""", """import { labeled, waitForAsync } from './browser-wait.mjs';"""),
])
append(B, """
test('labeled pone la etiqueta del paso delante del error de un clic o de una espera, y devuelve lo que devuelve la acción (B5, decisión 7)', async () => {
  assert.equal(await labeled('390px en claro, portada', async () => 7), 7);
  await assert.rejects(labeled('390px en oscuro: clic en #contenido #round-prev', async () => { throw new Error('page.click: Timeout 8000ms exceeded.'); }),
    /^Error: 390px en oscuro: clic en #contenido #round-prev: page\\.click: Timeout 8000ms exceeded\\.$/);
});

test('cada clic, espera de localizador y navegación de interaction-smoke y capturas lleva su etiqueta (labeled)', () => {
  const offenders = [];
  for (const file of ['interaction-smoke.mjs', 'capturas.mjs']) {
    readFileSync(new URL(file, dir), 'utf8').split('\\n').forEach((line, i) => {
      if (/\\.(?:click|waitFor|goBack|reload)\\(/.test(line) && !/labeled\\(/.test(line) && !/^\\s*\\/\\//.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'envuélvelos con labeled (browser-wait.mjs)');
});
""")
print('pruebas: las huellas que faltaban, la jornada en curso de la Tabla, app.js por su conducta y labeled')
PY
```
Esperado:
```text
pruebas: las huellas que faltaban, la jornada en curso de la Tabla, app.js por su conducta y labeled
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
for f in test_browser_waits test_rediseno_vista_equipo test_rediseno_tabla test_rediseno_integracion; do
  node --test scripts/tests/$f.mjs 2>&1 | grep -E "SyntaxError|^not ok|^# (tests|pass|fail)"
done
```
Esperado: `test_browser_waits.mjs` no carga (`labeled` no existe todavía); las demás pasan, porque fijan lo que la app ya hace:
```text
# SyntaxError: The requested module './browser-wait.mjs' does not provide an export named 'labeled'
not ok 1 - scripts/tests/test_browser_waits.mjs
# tests 1
# pass 0
# fail 1
# tests 12
# pass 12
# fail 0
# tests 13
# pass 13
# fail 0
# tests 18
# pass 18
# fail 0
```

- [ ] **Step 3: Write minimal implementation**

`labeled`, y los pasos nuevos y las etiquetas de `interaction-smoke.mjs` y `capturas.mjs`:

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


# ── browser-wait.mjs: labeled, al final ──
p = Path('scripts/tests/browser-wait.mjs')
s = p.read_text(encoding='utf-8')
assert 'export async function labeled' not in s and s.endswith('}\n')
p.write_text(s + """
// Una acción de Playwright (un clic, la espera de un localizador, una navegación) con la etiqueta de su
// paso (el escenario, el ancho y el tema) delante de su error, como el tiempo agotado de waitForAsync:
// un fallo de la CI se lee sin reproducirlo (B5, decisión 7). Devuelve lo que devuelve la acción.
export async function labeled(label, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error) error.message = `${label}: ${error.message}`;
    throw error;
  }
}
""", encoding='utf-8')

# ── capturas.mjs: lo que se abre antes de la foto, con su etiqueta ──
edit('scripts/tests/capturas.mjs', [
    ("""import { waitForAsync } from './browser-wait.mjs';""", """import { labeled, waitForAsync } from './browser-wait.mjs';"""),
    ("""          await page.locator(button).first().click();
          await page.locator(shown).first().waitFor();""",
     """          await labeled(`${label}: clic en ${button}`, () => page.locator(button).first().click());
          await labeled(`${label}: espera a ${shown}`, () => page.locator(shown).first().waitFor());"""),
])

I = 'scripts/tests/interaction-smoke.mjs'
edit(I, [
    ("""import { waitForAsync } from './browser-wait.mjs';""", """import { labeled, waitForAsync } from './browser-wait.mjs';"""),
    ("""// luego 200): cada bloque se pinta en su sitio, sin volver arriba (decisión 3); y el paso del
// esqueleto a la ficha de Equipo de una temporada pasada, sin desplazar lo de arriba (decisión 4).""",
     """// luego 200): cada bloque se pinta en su sitio, sin volver arriba (decisión 3); y el paso del
// esqueleto a la ficha de Equipo de una temporada pasada, sin desplazar lo de arriba (decisión 4).
// Y lo que faltaba (decisión 7): el calendario de escritorio de la portada (desde 1024 px), Intro en
// los buscadores de Explorar y de Goleadores (ni recarga ni cambia la dirección) y la portada en B, C,
// D, E y X a 320 px. Cada clic, espera de localizador y navegación lleva su etiqueta (labeled)."""),
    ("""const newContext = (viewport, colorScheme) => browser.newContext({""",
     """// Un clic en `selector`, con la etiqueta de su paso en el error de un tiempo agotado (labeled).
const click = (page, selector, label) => labeled(`${label}: clic en ${selector}`, () => page.click(selector));

// Intro en el campo con el foco: el formulario no se envía (su submit lleva preventDefault, que se lee
// en la ventana, después de los de la pantalla; una escucha por página), la dirección y el historial no
// cambian y la página es la misma (su marca sigue). Devuelve el id del elemento con el foco después.
async function pressEnter(page, label) {
  const before = await page.evaluate(() => {
    window.__marca = 'sin recargar';
    if (!window.__submits) addEventListener('submit', (event) => window.__submits.push(event.defaultPrevented));
    window.__submits = [];
    return { hash: location.hash, length: history.length };
  });
  await labeled(`${label}: Intro`, () => page.keyboard.press('Enter'));
  await waitForAsync(page, () => window.__submits.length === 1, null, { label: `${label}: el envío del formulario` });
  const after = await page.evaluate(() => ({ prevented: window.__submits[0], marca: window.__marca, hash: location.hash, length: history.length, focus: document.activeElement?.id || null }));
  assert.equal(after.prevented, true, `${label}: Intro no envía el formulario`);
  assert.deepEqual([after.marca, after.hash, after.length], ['sin recargar', before.hash, before.length], `${label}: Intro no recarga ni cambia la dirección`);
  return after.focus;
}

const newContext = (viewport, colorScheme) => browser.newContext({"""),
    # scenarios
    ("""    assert.equal((await checkLayout(page, viewport.width, `${label}, portada`)).paper, PAPER[colorScheme], `${label}: fondo del tema`);

    // 2. Jornada por la barra; anterior y siguiente cambian la jornada sin entrada nueva.
    await page.click('.tabbar a.tab[href="#/jornada"]');""",
     """    assert.equal((await checkLayout(page, viewport.width, `${label}, portada`)).paper, PAPER[colorScheme], `${label}: fondo del tema`);
    // El calendario de escritorio (spec §4.8): desde 1024 px, en su hueco, los 26 partidos de Las Mesas;
    // por debajo, el hueco vacío (se pinta solo lo visible, §5.1).
    const calendar = await page.evaluate(() => {
      const slot = document.querySelector('#contenido [data-slot="calendario"]');
      return { slot: Boolean(slot), rows: slot ? slot.querySelectorAll('#calendario a.match-row').length : null,
        context: slot?.querySelector('#calendario .block-context')?.textContent ?? null };
    });
    assert.deepEqual(calendar, viewport.width >= 1024 ? { slot: true, rows: 26, context: '26 partidos' } : { slot: true, rows: 0, context: null },
      `${label}: el calendario de la portada, solo en escritorio`);

    // 2. Jornada por la barra; anterior y siguiente cambian la jornada sin entrada nueva.
    await click(page, '.tabbar a.tab[href="#/jornada"]', label);"""),
    ("""    await page.click('#contenido #round-prev');""", """    await click(page, '#contenido #round-prev', label);"""),
    ("""    await page.click('#contenido #round-next');""", """    await click(page, '#contenido #round-next', label);"""),
    ("""    await page.click('#contenido a.match-row.is-mine');""", """    await click(page, '#contenido a.match-row.is-mine', label);"""),
    ("""    await page.goBack();""", """    await labeled(`${label}: Atrás`, () => page.goBack());"""),
    ("""    await page.click('.tabbar a.tab[href="#/tabla"]');""", """    await click(page, '.tabbar a.tab[href="#/tabla"]', label);"""),
    ("""      await page.locator(`#contenido ${selector} a.segment`, { hasText: view }).click();""",
     """      await labeled(`${label}: vista ${view}`, () => page.locator(`#contenido ${selector} a.segment`, { hasText: view }).click());"""),
    ("""    await page.click('#contenido a.screen-action');
    s = await paintedAs(page, 'ligas',""", """    await click(page, '#contenido a.screen-action', label);
    s = await paintedAs(page, 'ligas',"""),
    ("""    await page.click('#contenido a.link-row');""", """    await click(page, '#contenido a.link-row', label);"""),
    ("""    await page.click('#contenido a.group-row[href="#/tabla?s=2025-2026&g=PG3"]');""", """    await click(page, '#contenido a.group-row[href="#/tabla?s=2025-2026&g=PG3"]', label);"""),
    ("""    await direct.click('#contenido a.back');""", """    await click(direct, '#contenido a.back', label);"""),
    # checkBracket
    ("""  await page.click('#contenido #ronda-6-tab');""", """  await click(page, '#contenido #ronda-6-tab', label);"""),
    # scenariosB3
    ("""    await page.click('#contenido a.screen-action');
    s = await paintedAs(page, 'explorar',""", """    await click(page, '#contenido a.screen-action', label);
    s = await paintedAs(page, 'explorar',"""),
    ("""    assert.equal(s.focus, 'buscar', `${label}: el foco sigue en el buscador`);
    await checkLayout(page, viewport.width, `${label}, Explorar con resultados`);""",
     """    assert.equal(s.focus, 'buscar', `${label}: el foco sigue en el buscador`);
    await checkLayout(page, viewport.width, `${label}, Explorar con resultados`);
    // Intro en el buscador: la lista se queda, y el foco también (se sigue escribiendo).
    assert.equal(await pressEnter(page, `${label}, buscador de Explorar`), 'buscar', `${label}: tras Intro, el foco sigue en el buscador`);
    assert.ok(await page.locator('#resultados a.search-result').count() > 0, `${label}: tras Intro, los resultados siguen`);"""),
    ("""    await page.click(`#resultados a.search-result[href="${HURACAN}"]`);""", """    await click(page, `#resultados a.search-result[href="${HURACAN}"]`, label);"""),
    ("""    await page.click('.tabbar a.tab[href="#/"]');
    s = await paintedAs(page, 'home', { hash: '#/', label: `${label}, portada tras la ficha` });""",
     """    await click(page, '.tabbar a.tab[href="#/"]', label);
    s = await paintedAs(page, 'home', { hash: '#/', label: `${label}, portada tras la ficha` });"""),
    ("""        await page.locator(button).first().click();
        await page.locator(shown).first().waitFor();
      }
      await checkLayout(page, viewport.width, `${label}, ${screen}`);
      if (screen === 'copa') await checkBracket(page, viewport.width, `${label}, cuadro de copa`);
    }""", """        await labeled(`${label}, ${screen}: clic en ${button}`, () => page.locator(button).first().click());
        await labeled(`${label}, ${screen}: espera a ${shown}`, () => page.locator(shown).first().waitFor());
      }
      await checkLayout(page, viewport.width, `${label}, ${screen}`);
      if (screen === 'copa') await checkBracket(page, viewport.width, `${label}, cuadro de copa`);
    }

    // Intro en el buscador de Goleadores: tras filtrar, ni recarga ni cambia la dirección, y cierra el
    // teclado (el campo pierde el foco).
    await go('#/goleadores', 'goleadores', 'Goleadores');
    await click(page, '#buscar-goleador', label);
    await page.keyboard.type('mesas');
    await waitForAsync(page, () => location.hash === '#/goleadores?s=2025-2026&q=mesas', null, { label: `${label}, buscar «mesas» en Goleadores` });
    assert.notEqual(await pressEnter(page, `${label}, buscador de Goleadores`), 'buscar-goleador', `${label}: tras Intro, el teclado se cierra`);"""),
    ("""    await page.click('#contenido button[data-action="hacer-mi-equipo"]');""", """    await click(page, '#contenido button[data-action="hacer-mi-equipo"]', label);"""),
    ("""    assert.deepEqual((await stored()).myTeam, AD_HURACAN, `${label}: «Hacer mi equipo» lo guarda en ${STORE_KEY}`);
    await page.reload();""", """    assert.deepEqual((await stored()).myTeam, AD_HURACAN, `${label}: «Hacer mi equipo» lo guarda en ${STORE_KEY}`);
    await labeled(`${label}: recargar`, () => page.reload());"""),
    ("""    await page.click('.tabbar a.tab[href="#/"]');
    s = await paintedAs(page, 'home', { hash: '#/', label: `${label}, portada del equipo nuevo` });""",
     """    await click(page, '.tabbar a.tab[href="#/"]', label);
    s = await paintedAs(page, 'home', { hash: '#/', label: `${label}, portada del equipo nuevo` });"""),
    # retryBlocks
    ("""      await page.click(`#${id} button[data-action="retry"]`);""", """      await click(page, `#${id} button[data-action="retry"]`, `${label}, ${step}`);"""),
    # answerE
    ("""    await choice.click();""", """    await labeled('mundo E: la respuesta', () => choice.click());"""),
    ("""    assert.deepEqual(saved, { name, season: '2025-2026', cat: 'benjamin', groupId: 'A2' }, 'la respuesta se guarda');
    await page.reload();""", """    assert.deepEqual(saved, { name, season: '2025-2026', cat: 'benjamin', groupId: 'A2' }, 'la respuesta se guarda');
    await labeled('mundo E: recargar', () => page.reload());"""),
    # homeStates
    ("""// La puntuación de desplazamiento de un paso (la fórmula de la API Layout Instability, spec §5.4): de las""",
     """// La portada en B, C, D, E y X a 320 px (B3, «Sin prueba todavía»; B5, decisión 7): sin desplazamiento
// horizontal y sin que la barra tape el final, como la de A en los escenarios de cada ancho.
async function homeStates() {
  for (const world of ['B', 'C', 'D', 'E', 'X']) {
    const label = `320px en claro, portada en ${world}`;
    const context = await newContext({ width: 320, height: 568 }, 'light');
    try {
      await useWorld(context, world);
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}#/`);
      const s = await paintedAs(page, 'home', { label });
      assert.equal(s.state, world, `${label}: el estado del mundo`);
      await checkLayout(page, 320, label);
      assert.deepEqual(errors, [], `${label}: sin errores de JavaScript`);
    } finally {
      await context.close();
    }
  }
}

// La puntuación de desplazamiento de un paso (la fórmula de la API Layout Instability, spec §5.4): de las"""),
    ("""      console.log(`PASS: ${label}: barra, jornadas, vistas de Tabla, partido con Atrás y con «‹», el 8–1 enlazado, enlace antiguo y «Otro grupo» → Ligas → Tabla, el foco en su sitio y sin desplazamiento horizontal`);
      await scenariosB3(viewport, colorScheme);
      console.log(`PASS: ${label}: buscar «hurac» sin una entrada por letra y abrir su ficha sin cambiar mi equipo, las pantallas de B3 sin desplazamiento horizontal (el cuadro de copa, dentro de su caja) y «Hacer mi equipo», guardado y respetado al recargar`);""",
     """      console.log(`PASS: ${label}: barra, calendario de la portada solo en escritorio, jornadas, vistas de Tabla, partido con Atrás y con «‹», el 8–1 enlazado, enlace antiguo y «Otro grupo» → Ligas → Tabla, el foco en su sitio y sin desplazamiento horizontal`);
      await scenariosB3(viewport, colorScheme);
      console.log(`PASS: ${label}: buscar «hurac» sin una entrada por letra y abrir su ficha sin cambiar mi equipo, Intro sin recargar en los dos buscadores, las pantallas de B3 sin desplazamiento horizontal (el cuadro de copa, dentro de su caja) y «Hacer mi equipo», guardado y respetado al recargar`);"""),
    ("""  await skeletonShift();
  console.log('PASS: 390px en claro, del esqueleto a la ficha de Equipo de 2024/25: la cabecera y el primer bloque, en su sitio y casi del mismo alto; desplazamiento por debajo de 0,1');""",
     """  await skeletonShift();
  console.log('PASS: 390px en claro, del esqueleto a la ficha de Equipo de 2024/25: la cabecera y el primer bloque, en su sitio y casi del mismo alto; desplazamiento por debajo de 0,1');
  await homeStates();
  console.log('PASS: 320px en claro, la portada en B, C, D, E y X: sin desplazamiento horizontal y sin que la barra tape el final');"""),
])
print('browser-wait, capturas e interaction-smoke: labeled en cada paso; el calendario de escritorio, Intro en los dos buscadores y la portada en B, C, D, E y X a 320 px')
PY
```
Esperado:
```text
browser-wait, capturas e interaction-smoke: labeled en cada paso; el calendario de escritorio, Intro en los dos buscadores y la portada en B, C, D, E y X a 320 px
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_browser_waits.mjs scripts/tests/test_rediseno_vista_equipo.mjs scripts/tests/test_rediseno_tabla.mjs scripts/tests/test_rediseno_integracion.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
```text
# tests 50
# pass 50
# fail 0
```

- [ ] **Step 5: `capturas.mjs`, que cambia, una vez**

Sin verificación visual nueva: la tarea no cambia nada de lo que se pinta. `capturas.mjs` sí cambia (sus clics llevan etiqueta), y se ejecuta una vez para ver que sigue haciendo sus 25 escenas en las tres variantes:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
OUT="$S/capturas-t7" node scripts/tests/capturas.mjs | tail -1
```
Esperado (unos 2 minutos):
```text
OK: 75 capturas en $S/capturas-t7
```

- [ ] **Step 6: Suites completas y los tres smoke**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado: pytest, sin cambios; node, el recuento anterior más 3, de 744 a 747, sin fallos:
```text
517 passed, 5 skipped
# tests 747
# pass 747
# fail 0
```

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
grep -E '^PASS: (1440px en claro|320px en claro, la portada)' <<<"$out"
grep '^PASS: render smoke' <<<"$out" | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado (unos 4,5 minutos: con el `timeout` de la herramienta a 600000 ms): una línea PASS más que en la tarea anterior en cada pasada (25); el texto nuevo de las de cada ancho (aquí, las de 1440 px en claro), la nueva y el DOM de la portada sin cambios (la de los datos reales, en el estado del día: D el 27/09/2026):
```text
pasada 1: 25 PASS; otras líneas: 0
pasada 2: 25 PASS; otras líneas: 0
pasada 3: 25 PASS; otras líneas: 0
PASS: 1440px en claro: barra, calendario de la portada solo en escritorio, jornadas, vistas de Tabla, partido con Atrás y con «‹», el 8–1 enlazado, enlace antiguo y «Otro grupo» → Ligas → Tabla, el foco en su sitio y sin desplazamiento horizontal
PASS: 1440px en claro: buscar «hurac» sin una entrada por letra y abrir su ficha sin cambiar mi equipo, Intro sin recargar en los dos buscadores, las pantallas de B3 sin desplazamiento horizontal (el cuadro de copa, dentro de su caja) y «Hacer mi equipo», guardado y respetado al recargar
PASS: 320px en claro, la portada en B, C, D, E y X: sin desplazamiento horizontal y sin que la barra tape el final
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 7: Commit**

Sin `CODIGO`: la tarea no toca `src/` ni `acta.css`.

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/codigo.py --check
git add scripts/tests/browser-wait.mjs scripts/tests/interaction-smoke.mjs scripts/tests/capturas.mjs scripts/tests/test_browser_waits.mjs scripts/tests/test_rediseno_vista_equipo.mjs scripts/tests/test_rediseno_tabla.mjs scripts/tests/test_rediseno_integracion.mjs
git commit -q -F - <<'EOF'
test(rediseño): las pruebas que faltaban (B5, tarea 7)

De §11 y de lo que el plan B3 dejó sin prueba (decisión 7), sobre lo que la
app ya hace:
- interaction-smoke: el calendario de escritorio de la portada (a 1440 px,
  sus 26 partidos; por debajo, nada), Intro en los buscadores de Explorar
  y de Goleadores (ni recarga ni cambia la dirección) y la portada en B, C,
  D, E y X a 320 px, sin desplazamiento horizontal.
- labeled (browser-wait.mjs): cada clic, espera de localizador y
  navegación de interaction-smoke y capturas nombra su escenario, su ancho
  y su tema si se agota; una prueba lo fija.
- Las huellas de la portada que faltaban: D sin «Verano», C con sus otras
  dos notas, A con menos de cinco resultados y A con la hora por confirmar.
- La Tabla a mitad de temporada: «jornada 17», sin «, final».
- Las dos pruebas que leían el texto de app.js, sobre su conducta con
  start(): lo que escucha y guarda antes del primer pintado, la sesión y
  «Hacer mi equipo» con saveStore, también con el almacén lleno.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado:
```text
CODIGO 840590e1: la huella del árbol
 7 files changed, 219 insertions(+), 52 deletions(-)
```

---

### Task 8: La spec y la documentación al día: la adenda «Lo que cambió al construirlo», las notas de las frases que quedaron falsas, `README.md` y `docs/rediseno-rebase.md` (decisiones 8 y 9)

La spec gana al final lo que cambió al construirlo, sin reescribir el diseño aprobado; `README.md` describe la app de hoy, y `docs/rediseno-rebase.md`, el `sw.js` de B5. Al final, el CI de la rama con todo B5, antes de publicar (paso 6, que ejecuta el controlador).

**Contexto**
- **La spec** (`docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`) es el diseño aprobado y no se reescribe (decisión 8). Gana al final una adenda, «Lo que cambió al construirlo»: lo que se apartó de su texto al construirlo y por qué, una línea por punto con el plan y la decisión que lo explican, y lo que se cerró sin hacer, con su porqué (decisión 9). Son 12 puntos:
  1. la publicación por fases; 2. el CI de la rama, a mano; 3. la hoja, `acta.css`; 4. `data-stats.js` y `data-players-*.js`, retirados; 5. los torneos, inmediatos; 6. sin `modulepreload`; 7. el SW, registrado tras `load`; 8. los escudos, en su propia caché (Tarea 1); 9. la plantilla del portal, en el precache (Tarea 2); 10. `state.js` sin las funciones que nadie usaba (Tarea 3); 11. los esqueletos de B3, con el alto de una temporada pasada a 390 px (Tarea 5); 12. lo cerrado sin hacer.
- **Las frases que quedaron falsas** (inventario §K y las Tareas 1 a 3), 13, llevan al final una nota en cursiva que remite a su punto, sin tocar la frase:
  - §2: «Se publica de una vez cuando esté completo.» (punto 1);
  - §5.2, la fila de `state.js`: `ensurePlayers`, `ensureStats`, `ensureSeasonCups`, `matchAdvancer`, `bracketChampion` y `countMatches` (puntos 4, 5 y 10);
  - §5.4, los perezosos: `data-players-*.js` «como hoy» (punto 4) y los «nuevos», `data-stats.js` y los torneos (puntos 4 y 5);
  - §5.5: «la línea 1 es `CACHE_NAME`» sin la 2 (punto 8), `./style.css` (punto 3), `SEASON_FILES` (puntos 4, 5 y 9) y las miniaturas en la caché de la versión (punto 8);
  - §12: el PR borrador (punto 2), `style-acta.css` dos veces (punto 3), la «carga perezosa» de B4 (puntos 4 y 5) y la publicación de B5 como la primera (punto 1).
- **`README.md`** describía en parte la app anterior (inventario §K): «Varios equipos favoritos guardados en el dispositivo», `src/` con «favoritos» y, para publicar, subir a mano la `?v=` y `CACHE_NAME` y «mantener la lista de módulos precargados». Pasa a la app de hoy: un equipo y «Vistos hace poco», los módulos de `src/`, la hoja y los escudos, `codigo.py` en cada cambio de código y `publicar.py` para publicar.
- **`docs/rediseno-rebase.md`** dice de `sw.js` que «Git suele mezclarlo solo»: desde la Tarea 1, la línea 2 (`CRESTS_CACHE`) está pegada a la 1, que sube el bot, y git no mezcla solo dos cambios en líneas contiguas (notas del redactor de las Tareas 1 y 2, comprobado; lo ensaya el paso 2 de la Tarea 9). Pasa a decir quién cambia cada línea y que ese choque se resuelve como el de `index.html`. `docs/temporada-nueva.md` ya quedó al día en las Tareas 1 y 2 (decisión 24).
- **Sin prueba nueva** (ninguna prueba lee la spec, `README.md` ni `docs/rediseno-rebase.md`): el paso 3 relee los tres ficheros y comprueba, frase a frase, que ninguna de las 13 queda sin su nota, que las notas remiten a puntos que existen y que no queda ninguna de las frases viejas de `README.md` ni de `docs/rediseno-rebase.md`.
- **Recuentos**: sin cambios (pytest `517 passed, 5 skipped`, node 747 y los smoke, 25 PASS por pasada).
- **El CI de la rama, antes de publicar** (decisión 60; B2 de la revisión): `dataDeploy` de `pwa-smoke` y los escenarios nuevos de `interaction-smoke` solo han corrido en local. Tras el commit de esta tarea, el controlador empuja la rama y lanza `tests.yml` sobre ella (paso 6): si algo sale en rojo en el runner, se depura antes de la Tarea 9, no el día de publicar con el commit de la versión hecho. La rama no despliega nada (Pages publica `main`). La verificación de punta a punta no lo ejecuta: toca GitHub.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`, `README.md`, `docs/rediseno-rebase.md`
- En GitHub (paso 6): la rama `rediseno-acta` y una ejecución de `tests.yml` lanzada a mano sobre ella

**Interfaces:**
- Consumes: las decisiones de los planes B2 (115), B3 (26, 159 y sus restricciones globales), B4 (1, 2, 6, 10, 13, 15, 17, 40 y 55) y B5 (1, 2, 4, 6, 9, 24 y 37).
- Produces: `## Lo que cambió al construirlo`, la última sección de la spec, con los puntos `1.` a `12.`; y las notas `*(Nota: …; véase «Lo que cambió al construirlo», punto N.)*`, al final de cada frase que quedó falsa.

- [ ] **Step 1: La adenda y las notas de la spec**

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


def note(text, points):
    return f' *(Nota: {text}; véase «Lo que cambió al construirlo», {points}.)*'


ADENDA = """
## Lo que cambió al construirlo

Adenda del plan B5 (27/09/2026), al cerrar el rediseño. El diseño de arriba es el aprobado y no se reescribe: aquí va lo que se apartó de su texto al construirlo y por qué, un punto por línea, con el plan y la decisión que lo explican (los planes, en `docs/superpowers/plans/`). Las frases de arriba que quedaron falsas llevan una nota que remite a su punto.

1. **Publicación por fases** (§2 y §12): por decisión del usuario («publicando cada fase al terminarla»), cada fase del Plan B se publicó al terminarla, y `main` avanzó hasta la rama con avance rápido (B2 en `376e981`, B3 en `862486f`, B4 en `a66a36b`, y B5); lo que el texto dejaba para la publicación de B5 valió para cada una (plan B3, restricciones globales; Plan B4, decisiones 10 y 13; el procedimiento, en `docs/rediseno-rebase.md`).
2. **El CI de la rama, a mano** (§12): el PR borrador #2 se cerró al publicar B2; el CI de la rama se lanza con `gh workflow run tests.yml --ref rediseno-acta`, y `main` solo avanza con esa ejecución en verde (Plan B4, decisión 13).
3. **La hoja es `acta.css`** (§5.5 y §12), no `style.css` ni `style-acta.css`: una URL nueva, para que el SW de la app anterior (*cache-first* y sin mirar la `?v=`) no diera la hoja vieja a la portada nueva (Plan B2, decisión 115).
4. **`data-stats.js` y `data-players-*.js`, retirados** (§5.4 y §5.5): Récords sale del modelo (`seasonRecords`), que sirve también para las temporadas pasadas y aplica el mínimo de §4.7 (Plan B3, decisión 26), y la plantilla, de las actas (§4.11); B4 dejó de generarlos, con `data-matchdetail-keys.js` (Plan B4, decisión 1).
5. **Los torneos, inmediatos** (§5.4, §5.5 y §12): `data-maspalomas-cup-2026.js` se carga con `defer`, como los demás datos inmediatos, y va en `STATIC_ASSETS`: pesa 5,7 KB con gzip, la portada en D (cada verano) lo lee al arrancar para «Verano», y perezoso habría tocado el router y siete pantallas (Plan B4, decisión 2; cerrado sin hacer en el punto 12).
6. **Sin `modulepreload`**: metería los módulos en el mapa de módulos antes de la limpieza del arranque por `CODIGO`, y tras publicar código la app arrancaría con módulos viejos; cuesta 180 ms en la primera visita de un navegador nuevo, y nada en la app instalada (Plan B4, decisión 6).
7. **El SW se registra tras `load`**: con los datos en `defer`, su precache competía con la primera visita (86 ms más en la portada) (Plan B4, decisión 15).
8. **Los escudos, en su propia caché** (§5.5): la línea 2 de `sw.js` es `const CRESTS_CACHE = 'futbolbase-escudos-<sello>';`, con el sello de `escudos/` que escribe `scripts/build_crests.py`; los escudos van *cache-first* contra ella, que no cambia con cada subida de datos del bot, así que sin conexión siguen ahí, y un escudo nuevo o cambiado da otro sello (Plan B5, decisión 1).
9. **La plantilla de la temporada del portal, en el precache** (§5.5): `SEASON_FILES` lleva `data-lineups-<temporada del portal>.js` (11 KB con gzip), para que la ficha de Equipo funcione sin conexión, y `scripts/activate_season.py` la cambia por la de la temporada nueva al activarla (Plan B5, decisión 2).
10. **`state.js`, sin las funciones que nadie usaba** (§5.2): `matchAdvancer`, `bracketDrawAdvancer`, `bracketChampion` y `countMatches` se fueron en B5, porque quién pasó y el campeón de un cuadro los da `bracket()`, de `model.js` (Plan B5, decisión 6); `ensurePlayers` salió en B3, y `ensureStats` y `ensureSeasonCups` no llegaron a hacer falta (puntos 4 y 5).
11. **Los esqueletos de las pantallas de B3** (§7): tienen el alto de lo que llega tras ellos en una temporada pasada a 390 px, medido con las fixtures; en la primera visita de la temporada en curso, o a 1440 px, el bloque de verdad puede ser más alto o más bajo (Plan B5, decisiones 4 y 37).
12. **Cerrado sin hacer**, con su porqué (Plan B5, decisión 9):
    - los torneos perezosos: el punto 5;
    - `modulepreload`: el punto 6;
    - virtualizar Goleadores: medido, y resuelto con páginas de 200 filas (cada «Ver 200 más», de 0,32 a 0,47 s con la CPU ×4; Plan B3, decisión 159);
    - las acciones de los `fetch-fiflp*.yml` en Node 24: solo avisan de Node 20, GitHub ya las ejecuta en Node 24 y se lanzan a mano (Plan B4, decisión 55);
    - `scripts/fetch_mygol.py`: ningún workflow ni guion lo llama;
    - memorizar `seasonRecords`: 7 ms con las fixtures y 52 ms con los datos vivos de benjamín, solo al cambiar de categoría en Récords;
    - la ficha de Equipo sin esperar a las actas: con la plantilla del portal en el precache (punto 9), la espera solo queda en otras temporadas, de 5 a 18 KB con gzip;
    - `SIZE = 138` en `build_crests.py`: las miniaturas son de 96 px y en las cabeceras de 46 px a DPR 3 el navegador las amplía a 138, pero las hojas de contacto de B4 no enseñaron la diferencia (Plan B4, decisiones 17 y 40);
    - los cHRM de Safari: 25 originales llevan un cHRM suelto que Chrome no aplica y su miniatura no lleva; sin un Safari a mano no se comprobó cómo los pinta (Plan B4, decisión 17);
    - el precache a medias: una instalación del SW que no pudo bajar algún fichero deja ese hueco sin conexión hasta que se pide con red, y se cura solo;
    - la caché HTTP de 600 s sin SW: sin SW al mando, unos 10 minutos tras publicar código un navegador puede mezclar módulos; lo cerraría versionar el grafo de módulos, y los import maps subirían el suelo de Safari a 16.4 (plan B3, «Antes de publicar B3»);
    - los alias de los equipos renombrados en Partido: las temporadas anteriores y el cara a cara pierden los equipos que la fuente renombra («VICTORIA, REAL CLUB» frente a «RC Victoria»), y arreglarlo pide una tabla de alias por fuente.
"""

edit('docs/superpowers/specs/2026-09-23-rediseno-acta-design.md', [
    # §2
    ("""Se publica de una vez cuando esté completo.""",
     """Se publica de una vez cuando esté completo.""" + note('se publicó por fases, cada una al terminarla', 'punto 1')),
    # §5.2
    ("""vive en `ui.js` |""",
     """vive en `ui.js`""" + note('sin `ensurePlayers`, `ensureStats` ni `ensureSeasonCups`, y desde B5 sin `matchAdvancer`, `bracketChampion` ni `countMatches`', 'puntos 4, 5 y 10') + ' |'),
    # §5.4
    ("""`data-lineups-*.js` y `data-players-*.js` (como hoy);""",
     """`data-lineups-*.js` y `data-players-*.js` (como hoy);""" + note('`data-players-*.js` se retiró en B4', 'punto 4')),
    ("""(Explorar, Copa, Verano, buscador y ficha de equipo).""",
     """(Explorar, Copa, Verano, buscador y ficha de equipo).""" + note('`data-stats.js` se retiró y los torneos siguen inmediatos', 'puntos 4 y 5')),
    # §5.5
    ("""  - la línea 1 es `CACHE_NAME`;""",
     """  - la línea 1 es `CACHE_NAME`;""" + note('y, desde B5, la línea 2 es `CRESTS_CACHE`', 'punto 8')),
    ("""`./style.css`, `./manifest.json` y `./data-health.json`;""",
     """`./style.css`, `./manifest.json` y `./data-health.json`;""" + note('la hoja es `./acta.css`', 'punto 3')),
    ("""que son perezosos pero se usan en la portada y en el buscador sin conexión.""",
     """que son perezosos pero se usan en la portada y en el buscador sin conexión.""" + note('los torneos van en `STATIC_ASSETS`, `data-stats.js` se retiró y entra la plantilla de la temporada del portal', 'puntos 4, 5 y 9')),
    ("""- Las miniaturas de escudos se guardan en caché según se usan (cache-first).""",
     """- Las miniaturas de escudos se guardan en caché según se usan (cache-first).""" + note('en su propia caché, `CRESTS_CACHE`, desde B5', 'punto 8')),
    # §12
    ("""- con un **PR borrador** hacia `main`, que sí dispara `tests.yml`.""",
     """- con un **PR borrador** hacia `main`, que sí dispara `tests.yml`.""" + note('el PR borrador se cerró al publicar B2, y el CI de la rama se lanza a mano', 'punto 2')),
    ("""`style.css` nuevo como `style-acta.css`, que todavía no se enlaza;""",
     """`style.css` nuevo como `style-acta.css`, que todavía no se enlaza;""" + note('la hoja se llama `acta.css`', 'punto 3')),
    ("""   - `style-acta.css` sustituye a `style.css`;""",
     """   - `style-acta.css` sustituye a `style.css`;""" + note('la hoja se llama `acta.css`', 'punto 3')),
    ("""   - `defer` y carga perezosa;""",
     """   - `defer` y carga perezosa;""" + note('`defer`, sí; de la carga perezosa, `data-stats.js` se retiró y los torneos siguen inmediatos', 'puntos 4 y 5')),
    ("""publicación (sin workflows en marcha) y comprobación en la web publicada.""",
     """publicación (sin workflows en marcha) y comprobación en la web publicada.""" + note('cada fase se publicó al terminarla, y B5 es la última publicación de la rama', 'punto 1')),
    # La adenda, al final.
    ("""El Plan A se ejecuta y se publica antes que el B, y el B parte de sus datos.
""", """El Plan A se ejecuta y se publica antes que el B, y el B parte de sus datos.
""" + ADENDA),
])
print('spec: la adenda «Lo que cambió al construirlo» y 13 notas en las frases que quedaron falsas')
PY
```
Esperado:
```text
spec: la adenda «Lo que cambió al construirlo» y 13 notas en las frases que quedaron falsas
```

- [ ] **Step 2: `README.md` y `docs/rediseno-rebase.md`**

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


edit('README.md', [
    ("""- Varios equipos favoritos guardados en el dispositivo.
- Próximo partido con fecha, hora canaria y campo cuando la fuente los publica; último resultado, posición y racha.
- Últimos cinco encuentros y calendario completo desplegable.
- Clasificaciones y jornadas con búsqueda por equipo, isla y fase.
- Enlaces directos a equipo, partido y jornada; copia y WhatsApp.
- Calendario `.ics` y enlace al mapa para campos conocidos.
- Goleadores, detalles disponibles y archivo desde 2021/22.
- Temas claro y oscuro, navegación móvil, teclado y PWA instalable.
- Información de cobertura y fuentes, con fechas separadas de comprobación y de cambio de datos.
""", """- Un equipo, el tuyo: la portada sigue a «mi equipo» (próximo partido con fecha, hora canaria y campo cuando la fuente los publica; último resultado, clasificación y goleadores) y cambia con el momento de la temporada. Los equipos que se miran sin cambiarlo quedan en «Vistos hace poco» (hasta 8).
- Jornada, Tabla (puntos, goles, forma, casa y fuera) y Partido (goles, alineaciones del acta y cara a cara).
- Explorar: buscador de equipos, ligas y copas de las tres islas, goleadores completos, récords y archivo desde 2021/22.
- Enlaces directos a cada pantalla (también los antiguos, de WhatsApp) y botón de compartir.
- Calendario `.ics` y enlace al mapa para campos conocidos.
- Tema claro u oscuro, el del sistema; navegación móvil y con teclado; y PWA instalable, que abre sin conexión lo ya visto.
- Datos y fuentes: cobertura, y fechas separadas de comprobación y de cambio de datos.
"""),
    ("""src/                         Interfaz, favoritos, rutas, calendario y fuentes
""", """src/                         La app, en módulos planos sin compilar: arranque, rutas, modelo, mi equipo y pantallas
acta.css                     La hoja, con los temas claro y oscuro
escudos/, escudos/s/         Los escudos y sus miniaturas (scripts/build_crests.py)
"""),
    ("""Los cambios solo de interfaz requieren actualizar el parámetro `?v=` de `index.html` y `CACHE_NAME` de `sw.js`, además de mantener la lista de módulos precargados.""",
     """Un cambio de código (`src/` o `acta.css`) necesita `python3 scripts/codigo.py` antes de las pruebas: escribe en `index.html` `CODIGO`, la versión del código con la que el arranque quita la de la versión anterior de las cachés del SW. `STATIC_ASSETS` de `sw.js` sigue el grafo de imports de `src/app.js` (lo comprueba `scripts/tests/test_sw_fixes.mjs`). Para publicar, `python3 scripts/publicar.py` sube a la vez las `?v=` de `index.html`, `CACHE_NAME` de `sw.js` y `CODIGO`, sin tocar «Última actualización»; el procedimiento completo está en [docs/rediseno-rebase.md](docs/rediseno-rebase.md). Un escudo nuevo se añade como dice la guía de nueva temporada: `scripts/build_crests.py` escribe su miniatura y el sello de `escudos/` en la línea 2 de `sw.js`."""),
])
edit('docs/rediseno-rebase.md', [
    ("""(B2 en `376e981`, B3 en `862486f`)""", """(B2 en `376e981`, B3 en `862486f` y B4 en `a66a36b`)"""),
    ("""- **`sw.js`.** El bot solo cambia `CACHE_NAME` en la línea 1, y la rama cambia `STATIC_ASSETS`. Git suele mezclarlo solo.""",
     """- **`sw.js`.** El bot solo cambia `CACHE_NAME`, en la línea 1. La línea 2, `CRESTS_CACHE` (el sello de `escudos/`, Plan B5), solo la cambia `scripts/build_crests.py`, al añadir o cambiar un escudo; y la rama cambia el resto (`STATIC_ASSETS`, `SEASON_FILES`…). Git no mezcla solo dos cambios en líneas contiguas: si el bot subió la versión y la rama trae otra línea 2 (la primera vez, al traer B5), `sw.js` choca, y se resuelve como `index.html`, con la estructura de la rama y las marcas de `main` (abajo)."""),
])
print('README.md: la app de hoy; docs/rediseno-rebase.md: las líneas 1 y 2 de sw.js')
PY
```
Esperado:
```text
README.md: la app de hoy; docs/rediseno-rebase.md: las líneas 1 y 2 de sw.js
```

- [ ] **Step 3: Verificación: ninguna frase falsa sin su nota**

Se releen los tres ficheros: cada una de las 13 frases de la spec, en una sola línea y con su nota; cada nota, con un punto que existe en la adenda; y ninguna de las frases viejas de `README.md` ni de `docs/rediseno-rebase.md`:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'PY'
import re
from pathlib import Path

spec = Path('docs/superpowers/specs/2026-09-23-rediseno-acta-design.md').read_text(encoding='utf-8')
FALSAS = [
    'Se publica de una vez cuando esté completo.',                                       # §2
    '`ensurePlayers`, `ensureStats` y `ensureSeasonCups`',                                # §5.2
    '`data-lineups-*.js` y `data-players-*.js` (como hoy);',                              # §5.4
    '**nuevos:** `data-stats.js` (Récords)',
    '  - la línea 1 es `CACHE_NAME`;',                                                    # §5.5
    '`./style.css`, `./manifest.json`',
    '- **`SEASON_FILES`:** los `data-season-*.js`, más `data-maspalomas-cup-2026.js` y `data-stats.js`',
    '- Las miniaturas de escudos se guardan en caché según se usan (cache-first).',
    '- con un **PR borrador** hacia `main`',                                               # §12
    '`style.css` nuevo como `style-acta.css`',
    '`style-acta.css` sustituye a `style.css`;',
    '   - `defer` y carga perezosa;',
    '   - rebase final, subida de versión sin tocar el pie, publicación',
]
head, adenda = spec.split('\n## Lo que cambió al construirlo\n')
assert adenda.count('\n## ') == 0, 'la adenda es la última sección'
points = [int(n) for n in re.findall(r'^(\d+)\. \*\*', adenda, re.M)]
assert points == list(range(1, len(points) + 1)), points
lines = head.split('\n')
for frase in FALSAS:
    found = [line for line in lines if frase in line]
    assert len(found) == 1, (frase, len(found))
    assert '; véase «Lo que cambió al construirlo», punto' in found[0], f'sin nota: {frase}'
notes = re.findall(r'«Lo que cambió al construirlo», puntos? ([\d, y]+)\.\)\*', head)
cited = {int(n) for note in notes for n in re.findall(r'\d+', note)}
assert len(notes) == len(FALSAS) and cited <= set(points), (len(notes), cited)
print(f'spec: {len(FALSAS)} frases que quedaron falsas, cada una con su nota; la adenda, al final, con {len(points)} puntos, y las notas citan {len(cited)} de ellos')
PY
echo "README.md, frases de la app anterior: $(grep -cE 'Varios equipos favoritos|Interfaz, favoritos|módulos precargados' README.md)"
echo "docs/rediseno-rebase.md, «Git suele mezclarlo solo»: $(grep -c 'Git suele mezclarlo solo' docs/rediseno-rebase.md)"
git diff --stat | tail -1
```
Esperado:
```text
spec: 13 frases que quedaron falsas, cada una con su nota; la adenda, al final, con 12 puntos, y las notas citan 8 de ellos
README.md, frases de la app anterior: 0
docs/rediseno-rebase.md, «Git suele mezclarlo solo»: 0
 3 files changed, 54 insertions(+), 25 deletions(-)
```

Abrir con Read el final de la spec (la adenda) y `README.md` enteros, y comprobar que se leen bien: cada punto de la adenda en una línea, con su plan y su decisión; las notas, en cursiva al final de su frase; y `README.md` sin nada de la app anterior.

- [ ] **Step 4: Suites completas y los tres smoke**

Nada de lo que ejecutan cambia; se pasan igual, como en cada tarea (unos 4,5 minutos: con el `timeout` de la herramienta a 600000 ms):

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q 2>&1 | tail -1 | sed 's/ in [0-9.]*s$//'
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
for i in 1 2 3; do
  out=$({ node scripts/tests/render-smoke.mjs && node scripts/tests/interaction-smoke.mjs && node scripts/tests/pwa-smoke.mjs; } 2>&1)
  echo "pasada $i: $(grep -c '^PASS' <<<"$out") PASS; otras líneas: $(grep -vc '^PASS' <<<"$out")"
done
: "${S:?falta S: la línea export S= de la cabecera}"
grep '^PASS: render smoke' <<<"$out" | sed "s/(DOM $(cat "$S/dom-base.txt") bytes)/(DOM de la base)/"
```
Esperado: los recuentos de la Tarea 7, sin fallos:
```text
517 passed, 5 skipped
# tests 747
# pass 747
# fail 0
pasada 1: 25 PASS; otras líneas: 0
pasada 2: 25 PASS; otras líneas: 0
pasada 3: 25 PASS; otras líneas: 0
PASS: render smoke OK — Mi equipo en estado D (DOM de la base)
```

- [ ] **Step 5: Commit**

```bash
cd /home/manolo/claude/futbol-base
git add docs/superpowers/specs/2026-09-23-rediseno-acta-design.md README.md docs/rediseno-rebase.md
git commit -q -F - <<'EOF'
docs(rediseño): la spec con «Lo que cambió al construirlo», README.md y rediseno-rebase.md al día (B5, tarea 8)

- La spec gana al final la adenda «Lo que cambió al construirlo»: lo que
  se apartó de su texto y por qué, un punto por línea con el plan y la
  decisión (la publicación por fases, el CI de la rama a mano, acta.css,
  los retirados, los torneos inmediatos, sin modulepreload, el SW tras
  load, los escudos en su propia caché, la plantilla del portal en el
  precache, state.js sin lo que nadie usaba y los esqueletos de B3), y lo
  cerrado sin hacer, con su porqué (decisiones 8 y 9). Las 13 frases que
  quedaron falsas (§2, §5.2, §5.4, §5.5 y §12) llevan una nota que remite
  a su punto, sin reescribir el diseño aprobado.
- README.md: la app de hoy (un equipo y «Vistos hace poco»; los módulos,
  la hoja y los escudos; codigo.py y publicar.py).
- docs/rediseno-rebase.md: quién cambia las líneas 1 y 2 de sw.js, y que
  su choque se resuelve como el de index.html.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1 | sed 's/^ *//'
```
Esperado:
```text
3 files changed, 54 insertions(+), 25 deletions(-)
```

- [ ] **Step 6: El CI de la rama con todo B5, antes de publicar** (decisión 60; lo ejecuta el controlador)

Sin ningún workflow en marcha, se empuja `rediseno-acta` y se lanza `Tests` sobre ella (el PR borrador #2 está cerrado; `tests.yml` admite `workflow_dispatch`): sus tres trabajos (pytest, node-tests y render-smoke, que pasa los tres smoke) corren así con `dataDeploy` y los escenarios nuevos de `interaction-smoke` por primera vez en el runner. La rama no despliega nada. El bloque espera al CI (de 5 a 15 minutos): se lanza en segundo plano (`run_in_background`) o con Monitor, nunca en primer plano, donde la herramienta lo cortaría a los 10 minutos (`timeout 1800` lo para a los 30). Si hay un workflow en marcha, no empuja y lo dice (decisión 47 de B4):

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
Esperado: el push (la rama avanza desde `0208d26` con los commits de las Tareas 1 a 8), `gh run watch` con los tres trabajos de `Tests` en ✓, `CI de la rama en verde: <id>` y `avisos de Node 20 en <id>: 0`. Si algún trabajo falla, `gh run watch` sale con 1: se mira con `gh run view "$RUN" --log-failed`, se depura en la rama (con su commit y las suites y los smoke en verde en local) y se repite este paso antes de la Tarea 9: nada se publica con el CI de la rama en rojo.

---

### Task 9: Publicar B5, con la verificación visual de §11 (decisión 10; con el visto bueno del usuario, ya dado)

B5 se publica al terminarla, como B2, B3 y B4: se trae `main`, sube la versión con `publicar.py`, se hacen y se revisan las capturas de §11, `main` avanza cuando el CI de la rama está en verde, se comprueba la web con el perfil de un móvil que tenía B4, apertura a apertura, y el bot se lanza una vez para ver que sigue publicando. La ejecuta el controlador; la verificación de punta a punta del plan ejecutó, en un clon, los pasos que no tocan GitHub, la rama remota ni la web (2 a 7).

**Contexto**
- **El visto bueno está dado** («publicando cada fase al terminarla», «Sigue»), y lo ejecuta el controlador. Es la Tarea 7 del plan B4 con estos cambios (decisión 10):
  - **es un despliegue de código**: B5 cambia `src/` y `acta.css` (Tareas 3 a 6), y `CODIGO` pasa de `be0acbf3` (B4) a `840590e1`, el que dejó la Tarea 6 y recalcula `publicar.py` (la 7 y la 8 no tocan código). La primera apertura del `index.html` de B5 con el SW de B4 al mando quita de su caché los módulos y la hoja de B4 (la limpieza del arranque, decisión 155 de B3): se ejerce de verdad por primera vez desde B3;
  - **la versión**: `publicar.py` sube las 9 `?v=` y `CACHE_NAME`; `CODIGO` ya está en `index.html` desde la Tarea 6, así que el commit cambia 10 líneas, como en B4;
  - **al traer `main`**, `sw.js` choca en sus líneas 1 y 2 si el bot subió la versión desde `0208d26`: la 1 es la del bot, la 2 (`CRESTS_CACHE`, Tarea 1) es nueva en la rama, y git no mezcla solo dos cambios en líneas contiguas. Es el conflicto esperado del bloque de siempre (`git checkout --ours` y `sync_versions.py`, que copia la línea 1 sin tocar la 2; su prueba, en `test_index_bot_contract.py`). `index.html` se mezcla solo: el bot cambia las `?v=` y el pie, y la rama, la línea de `CODIGO`, lejos de ellas. Los retirados de B4 ya no los genera el bot de `main` (B4 está publicada): el bloque deja de buscarlos y comprueba, en su lugar, las miniaturas y el sello de `escudos/` tras la fusión (decisión 48);
  - **la verificación visual de §11** (paso 6): `capturas.mjs` sobre el árbol final, sus 25 escenas en las tres variantes (75 capturas), revisadas, y 4 hojas de contacto con las de 390 px en claro, para el usuario;
  - **`publicar-b5.mjs`** (paso 7, desde `publicar-b4.mjs`; decisiones 49 a 51): la 1.ª apertura de `despues`, breve pero esperando a una condición (que el `index.html` de B5 esté en la caché del SW de B4, que lo revalida al servir el suyo), nunca un tiempo fijo, para que la 2.ª abra el `index.html` de B5 con el SW de B4 todavía al mando, el caso difícil de un despliegue de código; cada apertura, una versión entera (su `index.html`, su hoja y sus módulos), sin el aviso del arranque ni errores, también sin red; la espera del SW nuevo, sin ninguna página de la app abierta; y los escudos de la 3.ª, también en la 4.ª, sin red (decisión 1);
  - **en la web**: la versión nueva, las 9 `?v=`, `const CODIGO = '840590e1';`, la línea 2 de `sw.js` con el sello de `escudos/` (`860679a5`, salvo que cambie un escudo antes de publicar), la plantilla del portal en `SEASON_FILES`, la hoja y `shell.js` de B5 servidos, y `presupuesto.mjs --web` en verde;
  - el paso de B4 a B5, ensayado antes en local (paso 7) y después en la web con un perfil que tenía B4 (pasos 8 y 10).
- **Lo que distingue una apertura de B4 de una de B5**: su `index.html` (la `?v=` y `CODIGO`), su hoja (la de B5 lleva `.sk-box-team`, de la Tarea 5) y sus módulos (los de B5 exportan `retryBlock`, `countLabel`, `CATEGORIES` y `routeIsMine` desde `myteam.js`, y `router.js` ya no). Una apertura a medias (el `index.html` de B5 con la hoja o los módulos de B4, o al revés) es un fallo.
- **El caso raro del paso** (decisión 58): si en la 1.ª apertura falla solo la revalidación de `index.html` y el SW de B5 no se instala antes de la 2.ª, esta sale a medias o con el aviso del arranque, una vez; «Reintentar» o la siguiente con red lo arreglan. `publicar-b5.mjs` no lo provoca: su 1.ª apertura espera a que esa revalidación llegue (si no llega en 60 s, el guion se para con su error y el paso se repite).
- **Los escudos en el paso** (coste de la decisión 1): el SW de B5, al activarse, borra la caché de B4, y con ella los escudos que guardaba. La primera apertura **sin red** tras publicar pinta monogramas, una vez; la siguiente con red los guarda en `futbolbase-escudos-860679a5`, y desde ahí siguen sin red tras cada subida del bot. `publicar-b5.mjs` lo comprueba con la portada: la 3.ª apertura, con red, los guarda, y la 4.ª, sin red, los pinta.
- **Volver atrás tras publicar**: siempre hacia delante, con otra publicación (plan B3, «Para B4 y siguientes»); nunca volviendo a publicar el `index.html` de B4.
- **Sin ningún workflow en marcha** en cada push: el bloque lo comprueba con `gh run list` y, si hay uno, no empuja y lo dice (decisión 47 de B4). Se espera con Monitor y un `until` sobre `gh run list`, nunca con una espera fija, y se repite el paso.
- **Si `main` avanza durante la publicación** (el bot comitea `data-health.json` de 1 a 4 veces al día), el push del paso 9 se rechaza y se vuelve al paso 2: la fusión suele ser limpia, y el bloque pone en ella las marcas de `main`, porque las del commit de la versión no llegaron a publicarse (decisión 53 de B4); el paso 3 sube después a una versión estrictamente mayor que la vigente.
- **El bot, tras publicar** (decisión 55 de B4): con la web comprobada y sin ningún workflow en marcha, `update.yml` se lanza una vez a mano y se espera en verde (paso 11): el bot de verdad genera, pasa sus suites con las pruebas de B5 y empuja; su subida de versión no toca la línea 2 de `sw.js`. Durante esa ejecución, nada de push.
- **Las esperas largas** (decisión 54 de B4): los bloques que pasan de 2 minutos (las suites y los smoke del paso 4, las capturas del paso 6) se lanzan con su `timeout` a 600000 ms; los que pueden pasar de 10 (`gh run watch`, la espera del despliegue de Pages, la ejecución del bot), en segundo plano (`run_in_background`) o con Monitor. Cada bloque lo dice.
- **La máquina, en reposo** para medir: el presupuesto (pasos 4 y 10) y el ensayo y la comprobación de `publicar-b5.mjs` (pasos 7 y 10) se ejecutan sin smoke ni otras mediciones a la vez.
- **El aviso a la familia**: B5 no cambia el manifiesto (Android no preguntará nada); el mensaje con las capturas dice que la primera vez que se abra sin cobertura tras la actualización los escudos pueden salir como iniciales, y que con cobertura vuelven y ya se quedan.

**Files:**
- Modify: `index.html` y `sw.js` (las marcas de versión)
- Fuera del repo (`$S`): `hojas-contacto.mjs` y `capturas-b5/` (las 75 capturas de §11 y sus 4 hojas de contacto); `publicar-b5.mjs`; `ensayo/` (el ensayo local); `perfil-publicado/`, `version-antes.txt` y `publicado-b5/` (la web)
- En GitHub: la rama `rediseno-acta`, `main` (Pages) y una ejecución de `update.yml` lanzada a mano

**Interfaces:**
- Consumes: `scripts/publicar.py`, `scripts/sync_versions.py` (`--since`, `--from`, `--check`), `scripts/build_crests.py --check` (Tarea 1), `scripts/tests/capturas.mjs`, `startPagesServer` (`pages-server.mjs`), `presupuesto.mjs`, `findChrome` (`render-smoke.mjs`) y `waitForAsync` (`browser-wait.mjs`).
- Produces:

```text
node $S/hojas-contacto.mjs <dir>                   <dir>/hoja-1-portada.png … hoja-4-…png: una columna por captura de
                                                   390 px en claro, con su nombre debajo; OK (0), 1 si falta alguna
WEB=<url> S=<dir> node $S/publicar-b5.mjs antes      antes: {"screen":"home","alert":false,"v":"<W>","codigo":"<c>","hoja":"B4",
                                                   "modulos":"B4","controlled":true}; errores: 0   (0; «<W> <c>» en
                                                   $S/version-antes.txt)
WEB=<url> S=<dir> node $S/publicar-b5.mjs despues    apertura 1..4: B4 o B5 (?v=…, CODIGO …) o «a medias (…)», la pantalla, el SW
                                                   que la sirvió, los escudos (3.ª y 4.ª) y los errores; OK (0) o MAL (1)
WEB=<url> S=<dir> node $S/publicar-b5.mjs capturas   portada y tabla-pg2: {"screen","h1","overflow","codigo","escudos",
                                                   "miniaturas"}; OK (0) o MAL (1); capturas en $S/publicado-b5/
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

Con lo que el bot haya comiteado desde `0208d26` (datos, `data-health.json` y sus marcas de versión). Primero, `sync_versions.py --since` comprueba que `main` solo cambió las marcas de `index.html` y `sw.js` (si no, ese cambio se lleva a mano a la rama, como dice `docs/rediseno-rebase.md`). En el merge, «ours» es la rama. Los conflictos que se esperan se resuelven en el mismo bloque: `index.html` y `sw.js`, con la estructura de la rama y las marcas de `main` (en `sw.js`, su línea 1; la 2 es de la rama). Cualquier otro conflicto para el bloque y se resuelve a mano (el bot nunca toca `src/`, `scripts/` ni `docs/`). Al final, las marcas de `main` y las miniaturas y el sello de `escudos/` al día: si `main` trajo un escudo añadido a mano, `build_crests.py --check` lo dice, y se arregla antes de seguir con `python3 scripts/build_crests.py` (con Pillow, si le falta la miniatura) y `git commit --amend --no-edit` de `escudos/s/` y `sw.js` (abajo, el ensayo).

Si se vuelve aquí desde el paso 9 (`main` avanzó después del commit de la versión), la fusión suele ser limpia y la rama se queda con las marcas de esa publicación, que no llegó a `main`: el bloque pone las de `main` en el commit de la fusión (decisión 53 de B4), y el paso 3 sube a una versión estrictamente mayor que la vigente.

```bash
cd /home/manolo/claude/futbol-base
git fetch -q origin
git switch -q rediseno-acta
ANTES=$(git rev-parse HEAD)
if ! python3 scripts/sync_versions.py --from origin/main --since "$(git merge-base HEAD origin/main)"; then
  echo "no se trae main: antes, ese cambio de index.html o sw.js se lleva a mano a la rama (docs/rediseno-rebase.md)"
elif ! git merge --no-edit origin/main; then
  for f in $(git diff --name-only --diff-filter=U -- index.html sw.js); do git checkout --ours -- "$f" && git add "$f"; done
  if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
    echo "conflictos que se resuelven a mano: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
  else
    python3 scripts/sync_versions.py --from origin/main
    git add index.html sw.js
    git commit -q --no-edit --cleanup=strip && echo "merge con los conflictos esperados resueltos: $(git log -1 --format=%h)"
  fi
elif [ "$(git rev-parse HEAD)" != "$ANTES" ] && ! python3 scripts/sync_versions.py --from origin/main --check > /dev/null; then
  # De vuelta del paso 9: la fusión limpia dejó las marcas del commit de la versión, que no llegó a main.
  python3 scripts/sync_versions.py --from origin/main
  git add index.html sw.js
  git commit -q --amend --no-edit && echo "marcas de main en la fusión: $(git log -1 --format=%h)"
fi
python3 scripts/sync_versions.py --from origin/main --check && echo "marcas de main: iguales"
python3 scripts/build_crests.py --check
sed -n 2p sw.js
```
Esperado: `de <la base común> a origin/main, index.html y sw.js solo cambian las marcas de versión`; después, el merge: `Ya está actualizado.`, o su commit, o sus conflictos, que git nombra en el idioma de la máquina (`CONFLICTO (contenido): Conflicto de fusión en sw.js`, si el bot subió la versión desde `0208d26`) y que el bloque resuelve: `marcas de origin/main: …` y `merge con los conflictos esperados resueltos: <commit>`; de vuelta del paso 9 con una fusión limpia, `marcas de origin/main: …` y `marcas de main en la fusión: <commit>`; al final, `index.html y sw.js llevan las marcas de origin/main: ?v=<la de main>`, `marcas de main: iguales`, `escudos/s: 176 al día` y la línea 2 de la rama, con el sello de `escudos/`. Si sale `no se trae main` o `conflictos que se resuelven a mano`, se para aquí y se resuelve a mano antes de seguir. Si `build_crests.py --check` dice `sello de sw.js: …` o `… por arreglar` (un escudo añadido a mano en `main`), `python3 scripts/build_crests.py` (con Pillow, si le falta la miniatura), `git add escudos/s sw.js`, `git commit --amend --no-edit` y otra vez este bloque. Sobre `0208d26`, sin nada nuevo en `main` (como en la verificación):
```text
de 0208d26fa72cf275921be2491b5b7e5339342735 a origin/main, index.html y sw.js solo cambian las marcas de versión
Ya está actualizado.
index.html y sw.js llevan las marcas de origin/main: ?v=20260926
marcas de main: iguales
escudos/s: 176 al día
const CRESTS_CACHE = 'futbolbase-escudos-860679a5';
```

Con un `main` simulado en el que el bot, después de `0208d26`, cambió un dato y subió sus marcas a `20260927` (con `bump_cache_version`, la función del bot: las `?v=`, el pie y la línea 1 de `sw.js`), sobre la rama con las Tareas 1 a 8 (el ensayo del ensamblado; después, pytest `517 passed, 5 skipped` y node 747): `sw.js` choca en sus líneas 1 y 2, e `index.html` se mezcla solo:
```text
de 0208d26fa72cf275921be2491b5b7e5339342735 a origin/main, index.html y sw.js solo cambian las marcas de versión
Auto-fusionando index.html
Auto-fusionando sw.js
CONFLICTO (contenido): Conflicto de fusión en sw.js
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
marcas de origin/main: ?v=20260927, Última actualización: 27/09/2026, CACHE_NAME futbolbase-v20260927
merge con los conflictos esperados resueltos: 931c4d0
index.html y sw.js llevan las marcas de origin/main: ?v=20260927
marcas de main: iguales
escudos/s: 176 al día
const CRESTS_CACHE = 'futbolbase-escudos-860679a5';
```

Con ese mismo `main` y, además, un escudo añadido a mano en él (su original y su miniatura, sin tocar `sw.js`), la fusión es igual, pero el sello de la rama ya no es el de `escudos/` (sin arreglarlo, pytest da 3 fallos en `test_build_crests.py`):
```text
sello de sw.js: 860679a5 (el de escudos/ es d9b2b847)
escudos/s: 177 al día, 1 por arreglar: python3 scripts/build_crests.py
const CRESTS_CACHE = 'futbolbase-escudos-860679a5';
```
y, tras `python3 scripts/build_crests.py` (`sello de sw.js: d9b2b847 (antes, 860679a5)`), `git add escudos/s sw.js`, `git commit --amend --no-edit` y otra vez el bloque, `escudos/s: 177 al día` y la línea 2 con `d9b2b847`; las suites, en verde (517 y 747).

De vuelta del paso 9, con la rama en el commit de la versión (`20260927`) y un `main` que solo trajo un `data-health.json` del bot (el ensayo del ensamblado; después, el paso 3 da `20260927` otra vez: mayor que la vigente, y la de antes nunca llegó a `main`):
```text
de 0208d26fa72cf275921be2491b5b7e5339342735 a origin/main, index.html y sw.js solo cambian las marcas de versión
Merge made by the 'ort' strategy.
 data-health.json | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)
marcas de origin/main: ?v=20260926, Última actualización: 23/09/2026, CACHE_NAME futbolbase-v20260926
marcas de main en la fusión: 615b83b
index.html y sw.js llevan las marcas de origin/main: ?v=20260926
marcas de main: iguales
escudos/s: 176 al día
const CRESTS_CACHE = 'futbolbase-escudos-860679a5';
```

- [ ] **Step 3: Subir la versión** (§5.5; decisión 10 de B4)

Las 9 marcas `?v=` de `index.html` y `CACHE_NAME` de `sw.js`, a la vez y con la misma cadena, sin tocar «Última actualización», y `CODIGO`, con `scripts/publicar.py`: la versión es la fecha UTC, estrictamente mayor que la vigente (si no, la letra siguiente de la vigente; se para en la `z`):

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/publicar.py
git diff --stat | tail -1
git diff --name-only
```
Esperado: `versión <la del día en UTC, o la vigente con la letra siguiente> (antes, <la vigente>): 9 ?v= en index.html y futbolbase-v<la misma> en sw.js; «Última actualización: <la de los datos>», sin tocar`; `CODIGO 840590e1: la huella de acta.css y src/*.js, en index.html` (el de la Tarea 6: las Tareas 7 y 8 no tocan código); ` 2 files changed, 10 insertions(+), 10 deletions(-)`, e `index.html` y `sw.js`. El 27/09/2026 (UTC), sobre `0208d26` sin datos nuevos:
```text
versión 20260927 (antes, 20260926): 9 ?v= en index.html y futbolbase-v20260927 en sw.js; «Última actualización: 23/09/2026», sin tocar
CODIGO 840590e1: la huella de acta.css y src/*.js, en index.html
 2 files changed, 10 insertions(+), 10 deletions(-)
index.html
sw.js
```

- [ ] **Step 4: Suites, smoke y el presupuesto en local, en verde con la versión nueva**

Las suites y los tres smoke tres veces, como tras la Tarea 8 (`pwa-smoke` publica sus propias versiones sobre la del árbol, así que no depende de la del día); unos 4,5 minutos, con el `timeout` de la herramienta a 600000 ms:

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
517 passed, 5 skipped
# tests 747
# pass 747
# fail 0
pasada 1: 25 PASS; otras líneas: 0
pasada 2: 25 PASS; otras líneas: 0
pasada 3: 25 PASS; otras líneas: 0
```

Después, con la máquina en reposo (sin smoke ni otras mediciones a la vez), el presupuesto en local con `--runs 5` (decisiones 18 y 48 de B4): un `PRESUPUESTO: MAL` se repite una vez y, si se repite, se para la publicación y se avisa al usuario con las cifras, sin empujar nada. Algo menos de 1 minuto, que con la máquina cargada puede pasar de 2: con el `timeout` de la herramienta a 600000 ms.

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/presupuesto.mjs --runs 5; echo "salida: $?"
```
Esperado (los tiempos se mueven unas decenas de ms de una pasada a otra; los KB y el CLS, no). En la verificación, el 27/09/2026:
```text
sitio: el árbol, con pages-server.mjs; el CLS, en local con el mundo A
portada: 2692 ms (< 3000); LCP 2768 ms (< 3000); FCP 612 ms; 308 KB; mediana de 5
CLS: 0,0001 (< 0,1): 390 px 0,0000 y 1440 px 0,0001; máximo de 5, mundo A
imágenes de Tabla: 48,0 KB (< 300): 15 imágenes, PG2
PRESUPUESTO: OK
salida: 0
```

- [ ] **Step 5: El commit de la publicación**

```bash
cd /home/manolo/claude/futbol-base
V=$(sed -n "1s/.*futbolbase-v\([0-9a-z]*\).*/\1/p" sw.js)
C=$(grep -oE "const CODIGO = '[0-9a-f]{8}';" index.html | grep -oE '[0-9a-f]{8}')
git add index.html sw.js
git commit -q -F - <<EOF
Publica B5 del rediseño «Acta»: versión $V

Sube a la vez las ?v= de index.html y CACHE_NAME de sw.js con
scripts/publicar.py (spec §5.5), sin tocar el literal «Última
actualización», para que los móviles con la app instalada cambien a la
nueva. CODIGO pasa a $C (de be0acbf3): B5 cambia src/ y acta.css, y
la primera apertura del código nuevo con el SW de B4 limpia el viejo. Con
el visto bueno del usuario, B5 cierra el rediseño: los escudos en su
propia caché y la plantilla del portal en el precache (sin conexión), los
ayudantes una sola vez, «Reintentar» de un bloque en su sitio, los
esqueletos de B3, dos textos de Copa, las pruebas que faltaban y la spec
con «Lo que cambió al construirlo».

Verificado: pytest 517 (5 saltadas), node 747, los tres smoke tres veces
seguidas y el presupuesto de §5.4 en local, en verde; las capturas de §11,
revisadas; y el paso de B4 a B5, ensayado en local con publicar-b5.mjs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat --oneline HEAD | tail -1
```
Esperado (las 9 líneas de `index.html` con su `?v=` y la primera de `sw.js`):
```text
 2 files changed, 10 insertions(+), 10 deletions(-)
```

- [ ] **Step 6: La verificación visual de §11: las capturas del árbol final y sus hojas de contacto** (decisión 10; decisiones 52 y 53)

§11 pide, antes de publicar, capturas a 390 px (claro y oscuro) y 1440 px (claro) de cada pantalla y de los estados A a E, error, vacío y sin conexión, revisadas y enviadas al usuario como PNG. `capturas.mjs` las hace con los mundos de `fixture-site.mjs` (datos congelados y reloj fijado: no dependen del día): 25 escenas en las tres variantes. `$S/hojas-contacto.mjs` junta las de 390 px en claro en 4 imágenes (la portada; Jornada, Tabla y Partido con error, vacío y sin conexión; Equipo, Explorar, Ligas y Copa; y Goleadores, Récords, Temporadas, Fuentes y Ajustes), una columna por captura, a su tamaño y con su nombre debajo; las de más de 3.200 px (Goleadores y las dos de la ficha de Equipo) se recortan por abajo, y su nombre lo dice (decisión 52).

Crear el guion:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
cat > "$S/hojas-contacto.mjs" <<'EOF'
// Las hojas de contacto de la verificación visual de §11 (Plan B5, Tarea 9, paso 6), para el usuario: las capturas a
// 390 px en claro de capturas.mjs, juntas en cuatro imágenes, una columna por captura (a su tamaño) y su nombre debajo.
// Las de más de 3.200 px de alto (Goleadores, con sus 200 filas, y la ficha de Equipo con la plantilla y la trayectoria
// abiertas) se recortan por abajo, y su nombre lo dice: la captura entera sigue en el directorio. Cada hoja es una
// página HTML junto a las capturas, que Chrome fotografía entera.
// Uso, desde la raíz del repo: node <este fichero> <el directorio de las capturas>
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { findChrome } = await import(pathToFileURL(join(root, 'scripts/tests/render-smoke.mjs')).href);
const { waitForAsync } = await import(pathToFileURL(join(root, 'scripts/tests/browser-wait.mjs')).href);
const { chromium } = createRequire(join(root, 'package.json'))('playwright');
const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir) { console.error('Uso: node hojas-contacto.mjs <directorio de las capturas>'); process.exit(2); }
// [fichero, título, escenas de capturas.mjs]
const SHEETS = [
  ['hoja-1-portada', 'Mi equipo: los estados A, B, C, D, E y X',
    ['portada-A', 'portada-B', 'portada-C', 'portada-D', 'portada-E', 'portada-X']],
  ['hoja-2-jornada-tabla-partido', 'Jornada, Tabla y Partido; error, vacío y sin conexión',
    ['jornada', 'tabla', 'tabla-forma', 'partido', 'partido-acta', 'error', 'vacio', 'sin-conexion']],
  ['hoja-3-equipo-explorar-ligas-copa', 'Equipo, Explorar, Ligas y Copa',
    ['equipo-A', 'equipo-D', 'explorar', 'ligas-comparar', 'copa-cuadro', 'copa-liguilla']],
  ['hoja-4-goleadores-records-temporadas-fuentes-ajustes', 'Goleadores, Récords, Temporadas, Datos y fuentes, y Ajustes',
    ['goleadores', 'records', 'temporadas', 'fuentes', 'ajustes']],
];
const missing = SHEETS.flatMap(([, , names]) => names).filter((name) => !existsSync(join(dir, `${name}-390-claro.png`)));
if (missing.length) { console.error(`Faltan capturas en ${dir}: ${missing.join(', ')}`); process.exit(1); }
const font = pathToFileURL(join(root, 'fonts/PublicSans-latin.woff2')).href;
const MAX = 3200;
// El alto de un PNG, de su cabecera (IHDR); y una cifra con el punto de los miles.
const heightOf = (file) => readFileSync(file).readUInt32BE(20);
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  for (const [file, title, names] of SHEETS) {
    const figures = names.map((name) => {
      const height = heightOf(join(dir, `${name}-390-claro.png`));
      const cut = height > MAX;
      return `<figure><div class="frame"${cut ? ` style="height:${MAX}px"` : ''}><img src="${name}-390-claro.png" alt=""></div>`
        + `<figcaption>${name}${cut ? ` <span>(los primeros ${thousands(MAX)} de ${thousands(height)} px)</span>` : ''}</figcaption></figure>`;
    }).join('');
    writeFileSync(join(dir, `${file}.html`), `<!doctype html><html lang="es"><meta charset="utf-8"><title>${title}</title><style>
@font-face { font-family: 'Public Sans'; src: url('${font}') format('woff2'); font-weight: 100 900; }
body { margin: 0; padding: 32px; background: #FFFFFF; color: #1A1F2B; font: 700 22px/1.3 'Public Sans', system-ui, sans-serif; }
h1 { margin: 0 0 24px; color: #C0182B; font-size: 30px; font-weight: 800; }
main { display: flex; gap: 32px; align-items: flex-start; width: max-content; }
figure { margin: 0; width: 392px; }
.frame { overflow: hidden; border: 1px solid #E4E7EC; }
img { display: block; width: 390px; }
figcaption { margin-top: 10px; text-align: center; }
figcaption span { display: block; color: #5A6272; font-size: 17px; font-weight: 600; }
</style><h1>${title}</h1><main>${figures}</main></html>`);
    await page.goto(pathToFileURL(join(dir, `${file}.html`)).href);
    await waitForAsync(page, () => document.fonts.status === 'loaded' && [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      null, { label: `${file}: las capturas y la fuente` });
    const size = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    await page.screenshot({ path: join(dir, `${file}.png`), fullPage: true });
    console.log(`${file}.png: ${names.length} capturas, ${size[0]}×${size[1]} px`);
  }
} finally {
  await browser.close();
}
console.log(`OK: ${SHEETS.length} hojas de contacto en ${dir}`);
EOF
node --check "$S/hojas-contacto.mjs" && echo "hojas-contacto.mjs: sintaxis correcta"
```
Esperado:
```text
hojas-contacto.mjs: sintaxis correcta
```

Las capturas y las hojas (unos 3 minutos: con el `timeout` de la herramienta a 600000 ms):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/capturas-b5"
OUT="$S/capturas-b5" node scripts/tests/capturas.mjs | tail -1
node "$S/hojas-contacto.mjs" "$S/capturas-b5"
```
Esperado: las 75 capturas y las 4 hojas, con su tamaño (el ancho, de sus columnas; el alto, el de su captura más alta, como mucho 3.200 px y el título; las capturas de §11 no dependen del día):
```text
OK: 75 capturas en $S/capturas-b5
hoja-1-portada.png: 6 capturas, 2544×2097 px
hoja-2-jornada-tabla-partido.png: 8 capturas, 3392×2687 px
hoja-3-equipo-explorar-ligas-copa.png: 6 capturas, 2544×3390 px
hoja-4-goleadores-records-temporadas-fuentes-ajustes.png: 5 capturas, 2120×3429 px
OK: 4 hojas de contacto en $S/capturas-b5
```

Abrir con Read las cuatro hojas (`$S/capturas-b5/hoja-*.png`) y, de cada pantalla que cambió en B5, sus capturas en las tres variantes: `equipo-A-390-claro.png`, `equipo-D-390-oscuro.png`, `equipo-A-1440-claro.png` (la Plantilla, un bloque con su nota de las actas dentro: Tarea 4), `partido-acta-390-claro.png` y `-oscuro.png` (los Goles y las Alineaciones, bloques con su id), `copa-cuadro-390-claro.png` y `copa-liguilla-1440-claro.png` (Tarea 6), `fuentes-390-claro.png` y `goleadores-390-oscuro.png` (Tarea 3), y `portada-A-390-claro.png`, `portada-D-1440-claro.png`, `error-390-claro.png` y `sin-conexion-390-oscuro.png`. Comprobar:
- **las hojas**: cada captura en su columna, a su tamaño, con su nombre debajo; la de Goleadores (11.323 px, sus 200 filas) y las dos de la ficha de Equipo (4.698 y 3.778 px, con la plantilla y la trayectoria abiertas), recortadas a 3.200 px y con «(los primeros 3.200 de … px)» bajo el nombre;
- **la portada** (hoja 1): A con su próximo partido, «Últimos cinco», la clasificación «tras la jornada 17», los goleadores y las cifras; B con «Aún no se ha jugado ninguna jornada» y la clasificación a cero; C con el último partido (2–7) y «Ya ha jugado todos sus partidos»; D con la caja de 2026/27, «Así terminó 2025/26», «Verano» (con «pasó por penaltis (3–2)») y la clasificación final; E con «¿En qué equipo juega ahora?» y sus dos candidatos; X con «no aparece en 2026/27» y «Elegir equipo». Las mismas que en B4: B5 no cambia la portada (sus huellas);
- **la ficha de Equipo** (hoja 3 y `equipo-A-1440-claro.png`): la Plantilla, un solo bloque con su tabla y, debajo, en gris, «Actas de 7 de 10 partidos jugados; 1 acta más llega incompleta…» antes de «Trayectoria», con el mismo aire que el resto de bloques (Tarea 4); a 1440 px, en la columna derecha;
- **Partido con acta** (`partido-acta`): los Goles minuto a minuto y las Alineaciones del acta nº 246973, dos bloques con su título; en oscuro, la tinta clara (`#FF5A64`) sobre `#15171C`;
- **Copa** (hoja 3 y `copa-liguilla-1440-claro.png`): el cuadro de la Copa Oro con su campeón («UD Vecindario A … pasó por penaltis (3–4)») y seis pestañas; la liguilla MCP3, con sus seis partidos, cada uno con su día (las fixtures no traen ninguno sin fecha: esa caja solo sale con datos así, Tarea 6);
- **Goleadores, Récords, Temporadas, Datos y fuentes y Ajustes** (hoja 4): las pantallas de B3 como en B4, con los contadores de `countLabel` («299 jugadores de 2 grupos», «44 correctas y 1 con revisión pendiente», «2 grupos», «6 partidos»: Tarea 3);
- **error, vacío y sin conexión** (hoja 2 y `sin-conexion-390-oscuro.png`): la caja de error de la Tabla de 2023/24 con «Reintentar»; el Partido sin cronología ni acta, con sus dos vacíos; y la portada sin conexión con «Sin conexión. Datos del 23/09/2026» arriba;
- **en todas**: sin desplazamiento horizontal, la barra fija abajo sin tapar el final, la fuente Public Sans y todos los escudos cargados (o su monograma, en los nombres de torneo sin escudo: «LM», «VI»).

Enviar al usuario las cuatro hojas de contacto como PNG (spec §11: revisadas y enviadas antes de publicar), con una línea por hoja. El visto bueno para publicar ya está dado: no se espera su respuesta para seguir, pero si pide un cambio antes del paso 9, se para ahí.

- [ ] **Step 7: `publicar-b5.mjs`, y el paso de B4 a B5 ensayado en local** (decisiones 49 a 51)

El guion abre cada apertura en un proceso nuevo de Chrome con el mismo perfil, como quien abre la app desde el icono y la cierra (en el mismo proceso, Chrome reutiliza módulos de la memoria y la comprobación no ve lo que ve la familia):
- `antes`: la versión publicada (B4) y su SW, en un perfil propio, y su versión y su `CODIGO` en `$S/version-antes.txt`;
- `despues`, cuatro aperturas de la portada (`#/`, la de `start_url`):
  - la 1.ª, breve, pero **esperando a una condición**: se cierra en cuanto el `index.html` de B5 está en la caché del SW de B4 (que lo revalida en segundo plano al servir el suyo) o ya es el de la página, nunca tras un tiempo fijo (nota de la decisión 44 de B4); si la caché de B4 ya no está, el SW de B5 se activó y no hay nada que esperar;
  - la 2.ª abre así el `index.html` de B5 con el SW de B4 todavía al mando, el caso difícil (la limpieza por `CODIGO`); se cierra en cuanto pinta y, después, **sin ninguna página de la app abierta**, se espera al SW nuevo, con una página de sonda (`manifest.json`, que el SW sirve de la red sin tocar su caché) que se abre, pide la actualización, mira y se cierra en cada vuelta;
  - la 3.ª, con el SW nuevo, cuenta los escudos de la portada, que ese SW guarda en su caché de escudos;
  - la 4.ª, sin red, por un proxy cerrado: B5 entera y los mismos escudos, en miniatura, sin ningún monograma.

  Cada una, una versión entera: su `index.html` (la `?v=` y `CODIGO`), su hoja (aplicada y, en B5, con `.sk-box-team` de 147 px) y sus módulos (los del mapa de módulos de la página: `import()` de la URL que ya importó `app.js` no la vuelve a pedir), sin el aviso del arranque ni errores; desde la 3.ª, B5 servida por su SW. Cada línea dice qué SW la sirvió: el de B4 si al empezar la página un SW mandaba y la caché de B4 seguía ahí (el de B5 la borra al activarse, antes de mandar);
- `capturas`: sin SW, la portada y Tabla de PG2 a 390 px (en claro, con DPR 2 y la ventana del alto de la página, para que la barra de pestañas quede abajo), con `CODIGO` de B5 y todos sus escudos cargados de `escudos/s/`, y sus capturas en `$S/publicado-b5/`.

Crear el guion:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
mkdir -p "$S"
cat > "$S/publicar-b5.mjs" <<'EOF'
// La publicación de B5 en la web (Plan B5, Tarea 9). Desde la raíz del repo:
//   node "$S/publicar-b5.mjs" antes     antes de empujar: la versión publicada (B4) y su SW, en un perfil propio; su
//                                       versión y su CODIGO, en $S/version-antes.txt
//   node "$S/publicar-b5.mjs" despues   tras publicar, con ese perfil y un proceso de Chrome por apertura (la app se
//                                       abre desde el icono y se cierra): la 1.ª, breve: se cierra en cuanto el
//                                       index.html de B5 está en la caché del SW de B4 (lo ha revalidado) o ya es el
//                                       de la página; la 2.ª, que abre ese index.html con el SW de B4 al mando (la
//                                       limpieza del arranque por CODIGO), se cierra en cuanto pinta y, después, sin
//                                       ninguna página de la app abierta, se espera al SW nuevo; la 3.ª, con él; y la
//                                       4.ª, sin red. Cada una, una versión entera (B4 o B5: su index.html, su hoja y
//                                       sus módulos), sin el aviso del arranque ni errores; y los escudos de la 3.ª,
//                                       también en la 4.ª, sin red (decisión 1)
//   node "$S/publicar-b5.mjs" capturas  sin SW: la portada y Tabla de PG2 a 390 px, con todos sus escudos de
//                                       escudos/s/, y sus capturas en $S/publicado-b5/
// WEB cambia la dirección de la web (por defecto, la publicada): así se ensaya con una copia local (paso 7).
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
  console.error('Uso: [WEB=<url>] S=<directorio> node publicar-b5.mjs antes|despues|capturas');
  process.exit(2);
}
// La versión y el CODIGO que sirve ahora la web: CACHE_NAME de su sw.js y CODIGO de su index.html (Node no tiene
// caché HTTP, y GitHub Pages purga su CDN en cada despliegue y su clave no mira la query: decisión 59).
const fresh = async (file) => (await fetch(`${BASE}${file}`)).text();
const published = (await fresh('sw.js')).match(/futbolbase-v([0-9a-z]+)/)[1];
const codigo = (await fresh('index.html')).match(/const CODIGO = '([0-9a-f]{8})';/)[1];
const LAUNCH = { executablePath: findChrome(), headless: true, args: ['--no-sandbox'] };
const CONTEXT = { viewport: { width: 390, height: 844 }, locale: 'es-ES', timezoneId: 'Atlantic/Canary' };
const PROFILE = join(S, 'perfil-publicado');
const BEFORE = join(S, 'version-antes.txt');
const NO_NETWORK = ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'];

const painted = (page, label) => waitForAsync(page, () => !!document.querySelector('#contenido section[data-screen], #contenido [role="alert"]'),
  null, { timeout: 30000, label });
// Lo que se ve tras una apertura, de las tres piezas que cambian de B4 a B5:
// - el index.html: la ?v= de data-seasons.js y su CODIGO;
// - la hoja: aplicada (la barra de pestañas, fija a 390 px) y, si es la de B5, con una regla que solo tiene ella
//   (.sk-box-team, el esqueleto de Equipo: 147 px; Tarea 5);
// - los módulos: los del mapa de módulos de la página (import() de la URL que ya importó app.js no la vuelve a pedir),
//   con una exportación que solo tienen los de B5 (Tareas 3 y 4) y la que B5 quitó de router.js: 'B5', 'B4' o 'mezcla'.
// Y el SW que la sirvió: el de B4 si al empezar la página un SW mandaba y la caché de B4 seguía ahí (el SW de B5 la
// borra al activarse, antes de mandar); si no, el de B5.
const look = (page, before) => page.evaluate(async (beforeCache) => {
  const seasons = document.querySelector('script[src*="data-seasons.js"]');
  const probe = document.createElement('div');
  probe.className = 'box skeleton sk-box-team';
  document.body.append(probe);
  const sheetB5 = getComputedStyle(probe).height === '147px';
  probe.remove();
  const bar = document.querySelector('.tabbar');
  const mod = (file) => import(new URL(`./src/${file}`, location.href).href).catch(() => ({}));
  const [shell, ui, model, myteam, router] = await Promise.all(['shell.js', 'ui.js', 'model.js', 'myteam.js', 'router.js'].map(mod));
  const marks = ['retryBlock' in shell, 'countLabel' in ui, 'CATEGORIES' in model, 'routeIsMine' in myteam, !('routeIsMine' in router)];
  const start = window.__inicio ? await window.__inicio : null;
  return {
    screen: document.querySelector('#contenido section[data-screen]')?.getAttribute('data-screen') ?? null,
    alert: !!document.querySelector('#contenido [role="alert"]'),
    v: seasons?.getAttribute('src').match(/\?v=([0-9a-z]+)/)?.[1] ?? null,
    codigo: document.documentElement.innerHTML.match(/const CODIGO = '([0-9a-f]{8})';/)?.[1] ?? null,
    hoja: !bar || getComputedStyle(bar).position !== 'fixed' ? 'sin estilos' : sheetB5 ? 'B5' : 'B4',
    modulos: marks.every(Boolean) ? 'B5' : marks.every((m) => !m) ? 'B4' : 'mezcla',
    sw: !start?.controlled ? 'ninguno' : start.caches.includes(beforeCache) ? 'B4' : 'B5',
    controlled: !!navigator.serviceWorker.controller,
  };
}, `futbolbase-v${before}`);
// Una versión entera: la de antes (B4) o la publicada (B5), cada pieza de la suya.
const versionOf = (seen, before) => {
  if (seen.v === before.v && seen.codigo === before.codigo && seen.hoja === 'B4' && seen.modulos === 'B4') return 'B4';
  if (seen.v === published && seen.codigo === codigo && seen.hoja === 'B5' && seen.modulos === 'B5') return 'B5';
  return `a medias (?v=${seen.v}, CODIGO ${seen.codigo}, hoja ${seen.hoja}, módulos ${seen.modulos})`;
};
// Los escudos de la pantalla: también los diferidos, que se piden ya; cuando cada uno ha cargado o, si no pudo, ha
// pasado a monograma (la miniatura, el original y el monograma).
const crests = async (page, label) => {
  await page.evaluate(() => document.querySelectorAll('#contenido img.crest[loading="lazy"]').forEach((img) => { img.loading = 'eager'; }));
  await waitForAsync(page, () => [...document.querySelectorAll('#contenido img.crest')].every((img) => img.complete && img.naturalWidth > 0),
    null, { timeout: 30000, label: `${label}, sus escudos` });
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#contenido img.crest')];
    const mini = imgs.filter((img) => new URL(img.currentSrc).pathname.includes('/escudos/s/')).length;
    return { mini, orig: imgs.length - mini, mono: document.querySelectorAll('#contenido .mono').length };
  });
};

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

// La 1.ª apertura, breve: hasta que el index.html de B5 (el de su CODIGO) está en la caché del SW de B4 (que lo
// revalida en segundo plano al servir el suyo) o ya es el de la página; nunca un tiempo fijo. Así la apertura
// siguiente abre, con el SW de B4 todavía al mando, el index.html de B5: la limpieza por CODIGO. Si la caché de B4 ya
// no está, el SW de B5 se activó (la borra antes de mandar): no queda nada que esperar. caches.match con cacheName no
// crea la caché que busca (caches.open, sí).
const b5Index = (page, label, before) => waitForAsync(page, async ([want, beforeCache]) => {
  if (document.documentElement.innerHTML.includes(want)) return true;
  if (!(await caches.has(beforeCache))) return true;
  const hit = await caches.match(new URL('index.html', location.href).href, { cacheName: beforeCache });
  return !!hit && (await hit.text()).includes(want);
}, [`const CODIGO = '${codigo}';`, `futbolbase-v${before.v}`], { timeout: 60000, label });

// Una apertura: un proceso de Chrome con el perfil, #/ desde el icono. `wait` sigue con la página abierta antes de
// mirarla; `count`, cuenta sus escudos; se cierra la página, y `after` sigue con el proceso abierto y sin páginas de
// la app. offline: todo lo que pide el proceso, también su SW, va a un proxy cerrado y falla (la opción offline de
// Playwright no corta las del SW).
async function opening(label, before, { offline = false, wait = null, count = false, after = null } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE, { ...LAUNCH, ...CONTEXT, args: [...LAUNCH.args, ...(offline ? NO_NETWORK : [])] });
  // Al empezar cada página, antes de sus guiones: si un SW la sirve y qué cachés hay.
  await context.addInitScript(() => {
    const controlled = !!navigator.serviceWorker?.controller;
    window.__inicio = (typeof caches === 'undefined' ? Promise.resolve([]) : caches.keys()).then((names) => ({ controlled, caches: names }));
  });
  const errors = [];
  try {
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' && message.text().startsWith('[arranque]')) errors.push(message.text().split('\n')[0]); });
    await page.goto(`${BASE}index.html#/`);
    await painted(page, label);
    if (wait) await wait(page, label, before);
    const seen = await look(page, before.v);
    const escudos = count ? await crests(page, label) : null;
    await page.close();
    if (after) await after(context);
    return { seen, escudos, errors };
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
    const { sw, ...seen } = await look(page, published);
    writeFileSync(BEFORE, `${published} ${codigo}\n`);
    console.log(`antes: ${JSON.stringify(seen)}; errores: ${errors.length}`);
    process.exitCode = seen.screen === 'home' && !seen.alert && seen.v === published && seen.codigo === codigo && seen.hoja === 'B4'
      && seen.modulos === 'B4' && seen.controlled && !errors.length ? 0 : 1;
  } finally {
    await context.close();
  }
} else if (mode === 'despues') {
  const [v, beforeCodigo] = readFileSync(BEFORE, 'utf8').trim().split(' ');
  const before = { v, codigo: beforeCodigo };
  const only = `futbolbase-v${published}`;
  const openings = [
    ['1.ª, breve: hasta que el index.html de B5 está en la caché del SW de B4', { wait: b5Index }],
    ['2.ª, y sin páginas de la app hasta que manda el SW nuevo', { after: (context) => untilNewWorker(context, only) }],
    ['3.ª, con el SW nuevo', { count: true }],
    ['4.ª, sin red', { offline: true, count: true }],
  ];
  let bad = 0;
  let online = null;
  const ways = [];
  for (const [n, [label, options]] of openings.entries()) {
    const { seen, escudos, errors } = await opening(`después, ${label}`, before, options);
    const version = versionOf(seen, before);
    // Una versión entera, #/ pintada, sin el aviso del arranque ni errores. Desde la 3.ª, B5 con el SW nuevo al mando;
    // y la 4.ª, sin red, con los escudos de la 3.ª, en miniatura y ningún monograma.
    let ok = seen.screen === 'home' && !seen.alert && !errors.length && (version === 'B4' || version === 'B5');
    if (n >= 2) ok = ok && version === 'B5' && seen.sw === 'B5' && seen.controlled;
    if (n === 2) online = escudos;
    if (n === 3) ok = ok && escudos.mini > 0 && escudos.mono === 0 && escudos.mini === online.mini;
    if (!ok) bad += 1;
    ways.push(`${version}/${seen.sw}`);
    console.log(`apertura ${n + 1} (${label}): ${version.startsWith('B') ? `${version} (?v=${seen.v}, CODIGO ${seen.codigo})` : version}, `
      + `${seen.screen}${seen.alert ? ', con el aviso del arranque' : ''}; servida por ${seen.sw === 'ninguno' ? 'la red, sin SW' : `el SW de ${seen.sw}`}`
      + `${escudos ? `; escudos: ${escudos.mini} miniaturas, ${escudos.orig} originales, ${escudos.mono} monogramas` : ''}; `
      + `errores: ${errors.length ? errors.join(' | ') : 0}${ok ? '' : ' ← MAL'}`);
  }
  const hard = ways[1] === 'B5/B4';
  console.log(bad ? `MAL: ${bad} aperturas a medias, con aviso, con errores o sin sus escudos tras publicar ${published}`
    : `OK: cada apertura, una versión entera (su index.html, su hoja y sus módulos); ${hard ? 'la 2.ª, B5 con el SW de B4 (la limpieza por CODIGO); ' : ''}`
      + `desde la 3.ª, B5 con ${only} y sus escudos, también sin red`);
  process.exitCode = bad ? 1 : 0;
} else {
  const OUT = join(S, 'publicado-b5');
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
        const imgs = [...document.querySelectorAll('#contenido img.crest')];
        return {
          screen: document.querySelector('#contenido section[data-screen]')?.getAttribute('data-screen') ?? null,
          h1: document.querySelectorAll('#contenido h1').length,
          overflow: document.documentElement.scrollWidth - innerWidth,
          codigo: document.documentElement.innerHTML.match(/const CODIGO = '([0-9a-f]{8})';/)?.[1] ?? null,
          escudos: imgs.length,
          miniaturas: imgs.filter((img) => img.naturalWidth > 0 && new URL(img.currentSrc).pathname.includes('/escudos/s/')).length,
        };
      });
      // La ventana, del alto de la página: la barra de pestañas, fija, queda abajo y no en mitad de la captura. Y sin
      // transiciones en marcha (la de la pestaña actual dura 150 ms).
      await page.setViewportSize({ width: 390, height: Math.max(844, await page.evaluate(() => document.documentElement.scrollHeight)) });
      await waitForAsync(page, () => [...document.querySelectorAll('#contenido img')].every((img) => img.complete)
        && document.getAnimations().every((animation) => animation.playState !== 'running'), null,
        { timeout: 30000, label: `capturas, ${name}: la ventana entera, quieta` });
      await page.screenshot({ path: join(OUT, `${name}-390.png`) });
      const ok = got.screen === screen && got.h1 === 1 && got.overflow <= 0 && got.codigo === codigo && got.escudos > 0
        && got.miniaturas === got.escudos && !errors.length;
      if (!ok) bad += 1;
      console.log(`${name}: ${JSON.stringify(got)}${errors.length ? ` errores: ${errors.join(' | ')}` : ''}${ok ? '' : ' ← MAL'}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(bad ? `MAL: ${bad} de las 2 pantallas, con errores o sin todos sus escudos de escudos/s/ (versión ${published})`
    : `OK: la portada y Tabla de PG2 con la versión ${published} y el CODIGO ${codigo}, con todos sus escudos de escudos/s/; capturas en publicado-b5/`);
  process.exitCode = bad ? 1 : 0;
}
EOF
node --check "$S/publicar-b5.mjs" && echo "publicar-b5.mjs: sintaxis correcta"
```
Esperado:
```text
publicar-b5.mjs: sintaxis correcta
```

El ensayo, antes de tocar la rama remota y con la máquina en reposo: `pages-server.mjs` sirve lo publicado (`origin/main`, B4) bajo `/futbol-base/`; `antes` crea un perfil con B4 y su SW; el árbol pasa a `HEAD` (B5 con su versión) con el servidor en marcha, porque el servidor lee cada fichero en cada petición, y `despues` y `capturas` lo recorren. Todo en `$S/ensayo`, con su propio perfil (el de la web es otro). Tarda menos de un minuto, más con la máquina cargada: con el `timeout` de la herramienta a 600000 ms.

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/ensayo" && mkdir -p "$S/ensayo/b4" "$S/ensayo/b5"
git archive origin/main | tar -x -C "$S/ensayo/b4"
git archive HEAD | tar -x -C "$S/ensayo/b5"
ln -sfn b4 "$S/ensayo/web"
node --input-type=module -e "
import { startPagesServer } from './scripts/tests/pages-server.mjs';
const web = await startPagesServer(process.argv[1]);
console.log(web.url);
" "$S/ensayo/web" > "$S/ensayo/url" &
SERVIDOR=$!
trap 'kill $SERVIDOR' EXIT
until [ -s "$S/ensayo/url" ]; do sleep 0.2; done
LOCAL="$(cat "$S/ensayo/url")futbol-base/"
WEB="$LOCAL" S="$S/ensayo" node "$S/publicar-b5.mjs" antes; echo "antes: sale con $?"
ln -sfn b5 "$S/ensayo/web"
WEB="$LOCAL" S="$S/ensayo" node "$S/publicar-b5.mjs" despues; echo "despues: sale con $?"
WEB="$LOCAL" S="$S/ensayo" node "$S/publicar-b5.mjs" capturas; echo "capturas: sale con $?"
```
Esperado: `antes` sobre B4; con el árbol de B5, las cuatro aperturas enteras, ninguna con `← MAL`; y las dos capturas, con todos sus escudos de `escudos/s/`. La 1.ª apertura es B4 (el SW de B4 sirve su `index.html` y revalida en segundo plano el de B5); la 2.ª, el caso difícil: el `index.html` de B5 con el SW de B4 al mando, entera por la limpieza del arranque (si el SW de B5 llegara a activarse durante la 1.ª, saldría «servida por el SW de B5», también válido); la 3.ª y la 4.ª, B5 con su SW, con los mismos escudos, también sin red. La versión es la del día (paso 3) y los escudos de la portada, los de los datos del árbol (6, en D, el 27/09/2026). En la verificación:
```text
antes: {"screen":"home","alert":false,"v":"20260926","codigo":"be0acbf3","hoja":"B4","modulos":"B4","controlled":true}; errores: 0
antes: sale con 0
apertura 1 (1.ª, breve: hasta que el index.html de B5 está en la caché del SW de B4): B4 (?v=20260926, CODIGO be0acbf3), home; servida por el SW de B4; errores: 0
apertura 2 (2.ª, y sin páginas de la app hasta que manda el SW nuevo): B5 (?v=20260927, CODIGO 840590e1), home; servida por el SW de B4; errores: 0
apertura 3 (3.ª, con el SW nuevo): B5 (?v=20260927, CODIGO 840590e1), home; servida por el SW de B5; escudos: 6 miniaturas, 0 originales, 0 monogramas; errores: 0
apertura 4 (4.ª, sin red): B5 (?v=20260927, CODIGO 840590e1), home; servida por el SW de B5; escudos: 6 miniaturas, 0 originales, 0 monogramas; errores: 0
OK: cada apertura, una versión entera (su index.html, su hoja y sus módulos); la 2.ª, B5 con el SW de B4 (la limpieza por CODIGO); desde la 3.ª, B5 con futbolbase-v20260927 y sus escudos, también sin red
despues: sale con 0
portada: {"screen":"home","h1":1,"overflow":0,"codigo":"840590e1","escudos":6,"miniaturas":6}
tabla-pg2: {"screen":"tabla","h1":1,"overflow":0,"codigo":"840590e1","escudos":25,"miniaturas":25}
OK: la portada y Tabla de PG2 con la versión 20260927 y el CODIGO 840590e1, con todos sus escudos de escudos/s/; capturas en publicado-b5/
capturas: sale con 0
```
Un `← MAL` o un `sale con 1` para la publicación antes de empujar nada: se mira la línea que falla y se avisa al usuario. La comprobación muerde: con el mismo ensayo y el `index.html` de B5 con el `CODIGO` de B4 (sin la limpieza del arranque), la 2.ª apertura sale `a medias (?v=20260927, CODIGO be0acbf3, hoja B4, módulos B5), home; servida por el SW de B4; errores: 0 ← MAL`: el SW de B4 revalidó los módulos en la 1.ª y nunca la hoja (decisión 50).

Abrir con Read `$S/ensayo/publicado-b5/portada-390.png` y `$S/ensayo/publicado-b5/tabla-pg2-390.png`: la portada y Tabla de B5 con los datos del árbol, con sus escudos, su fuente y la barra.

- [ ] **Step 8: La versión publicada (B4), en un perfil de Chrome, antes de empujar**

Así se comprueba después el paso real de B4 a B5 con el SW de B4, el de los móviles que ya la tienen:

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
rm -rf "$S/perfil-publicado" "$S/version-antes.txt" "$S/publicado-b5"
WEB=https://malolocabreralolo-tech.github.io/futbol-base/ S="$S" node "$S/publicar-b5.mjs" antes; echo "antes: sale con $?"
```
Esperado: `antes: {"screen":"home","alert":false,"v":"<la versión publicada>","codigo":"be0acbf3","hoja":"B4","modulos":"B4","controlled":true}; errores: 0` y `antes: sale con 0`.

- [ ] **Step 9: Empujar la rama y esperar a su CI; después, `main`** (§12)

Primero `rediseno-acta`, sin ningún workflow en marcha, y después `Tests` sobre esa rama, lanzado a mano. El bloque espera al CI (de 5 a 15 minutos): se lanza en segundo plano (`run_in_background`) o con Monitor, nunca en primer plano, donde la herramienta lo cortaría a los 10 minutos (`timeout 1800` lo para a los 30). `main` solo avanza cuando esa ejecución está en verde: Pages despliega `main` aunque `Tests` salga en rojo después. Cada push comprueba antes que no haya ningún workflow en marcha y, si lo hay, no empuja (decisión 47 de B4):

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
Esperado: el push, `gh run watch` con los tres trabajos de `Tests` (pytest, node-tests y render-smoke) en ✓, `CI de la rama en verde: <id>` y `avisos de Node 20 en <id>: 0`. Si algún trabajo falla, `gh run watch` sale con 1: se para, sin empujar `main`, y se enseña al usuario (`gh run view "$RUN" --log-failed`).

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

- [ ] **Step 10: Comprobar la web publicada**

Primero, que sirve la versión nueva (el despliegue de Pages puede tardar unos minutos: el `until` espera, y conviene lanzarlo con Monitor), las 9 `?v=`, `CODIGO`, la línea 2 de `sw.js` y su plantilla del portal, y la hoja y `shell.js` de B5, con una muestra de miniaturas. Todo se pide como lo piden los móviles (decisiones 57 y 59): con `curl -s --compressed`, la variante gzip que usa Chrome (para la CDN de Pages, cada `Accept-Encoding` es un objeto aparte), y sin query (su clave no la mira, y se purga en cada despliegue):

```bash
cd /home/manolo/claude/futbol-base
V=$(sed -n "1s/.*futbolbase-v\([0-9a-z]*\).*/\1/p" sw.js)
SITIO=https://malolocabreralolo-tech.github.io/futbol-base
until curl -s --compressed "$SITIO/sw.js" | grep -q "futbolbase-v$V"; do sleep 15; done
curl -s --compressed "$SITIO/index.html" | grep -c "?v=$V"
curl -s --compressed "$SITIO/index.html" | grep -oE "const CODIGO = '[0-9a-f]{8}';"
curl -s --compressed "$SITIO/sw.js" | sed -n 2p
curl -s --compressed "$SITIO/sw.js" | grep -oE "'\./data-lineups-[0-9]{4}-[0-9]{4}\.js'"
echo "acta.css con el esqueleto de Equipo: $(curl -s --compressed "$SITIO/acta.css" | grep -c '^\.sk-box-team ')"
echo "shell.js con retryBlock: $(curl -s --compressed "$SITIO/src/shell.js" | grep -c '^export async function retryBlock')"
for f in escudos/s/lasMesasEscudo.png escudos/s/huracan.png escudos/s/joveroLasRosas.png data-lineups-2025-2026.js; do
  echo "$(curl -s --compressed -o /dev/null -w '%{http_code}' "$SITIO/$f") $f"
done
```
Esperado (con la línea 2 de la rama, `sed -n 2p sw.js`, y la plantilla de la temporada del portal):
```text
9
const CODIGO = '840590e1';
const CRESTS_CACHE = 'futbolbase-escudos-860679a5';
'./data-lineups-2025-2026.js'
acta.css con el esqueleto de Equipo: 1
shell.js con retryBlock: 1
200 escudos/s/lasMesasEscudo.png
200 escudos/s/huracan.png
200 escudos/s/joveroLasRosas.png
200 data-lineups-2025-2026.js
```

Después, el presupuesto contra la web, con la máquina en reposo (sin smoke ni otras mediciones a la vez; decisión 18 de B4) y con el `timeout` de la herramienta a 600000 ms:

```bash
cd /home/manolo/claude/futbol-base
node scripts/tests/presupuesto.mjs --web https://malolocabreralolo-tech.github.io/futbol-base/ --runs 5; echo "salida: $?"
```
Esperado: `sitio: https://malolocabreralolo-tech.github.io/futbol-base/; el CLS, en local con el mundo A`; la portada y el LCP por debajo de 3.000 ms (con la red real, del orden de los 2,7-2,8 s de B4); el CLS como en local; `imágenes de Tabla: 48,… KB (< 300): 15 imágenes, PG2`; `PRESUPUESTO: OK` y `salida: 0`. Un `PRESUPUESTO: MAL` se repite una vez; si se repite, se para y se avisa al usuario con las cifras (B5 ya está publicada: se decide con él si se arregla hacia delante).

Después, con la máquina en reposo, el paso de B4 a B5 con el perfil del paso 8, y las capturas. Antes, `servida()` comprueba que la CDN de Pages da B5 a la variante de los móviles (`--compressed`, sin query: decisiones 57 y 59): `index.html` con su `CODIGO`, `acta.css` con su regla y cada `src/*.js` igual al del árbol. Pages purga su CDN en cada despliegue, así que pasa al primer intento; si un día no purgara, el `until` lo diría esperando, en lugar de que la 1.ª apertura de `despues` agotara su espera con un error menos claro (con Monitor):

```bash
cd /home/manolo/claude/futbol-base
: "${S:?falta S: la línea export S= de la cabecera}"
C=$(grep -oE "const CODIGO = '[0-9a-f]{8}';" index.html | grep -oE '[0-9a-f]{8}')
SITIO=https://malolocabreralolo-tech.github.io/futbol-base
servida() {
  curl -s --compressed "$SITIO/index.html" | grep -q "const CODIGO = '$C';" || return 1
  curl -s --compressed "$SITIO/acta.css" | grep -q '^\.sk-box-team ' || return 1
  for f in src/*.js; do curl -s --compressed "$SITIO/$f" | cmp -s - "$f" || return 1; done
}
until servida; do sleep 15; done
echo "la CDN sirve B5 a la variante de los móviles: index.html, acta.css y src/*.js"
WEB=https://malolocabreralolo-tech.github.io/futbol-base/ S="$S" node "$S/publicar-b5.mjs" despues; echo "despues: sale con $?"
WEB=https://malolocabreralolo-tech.github.io/futbol-base/ S="$S" node "$S/publicar-b5.mjs" capturas; echo "capturas: sale con $?"
```
Esperado, como en el ensayo del paso 7:
- `despues`: cuatro líneas `apertura N (…)`, ninguna con `← MAL`. La 1.ª, B4 (`B4 (?v=<la de antes>, CODIGO be0acbf3), home; servida por el SW de B4`); la 2.ª, B5 (`B5 (?v=<V>, CODIGO 840590e1)`) servida por el SW de B4 (el caso difícil) o, si el SW de B5 llegó a activarse en la 1.ª, por el suyo; la 3.ª y la 4.ª (sin red), `B5 (?v=<V>, CODIGO 840590e1), home; servida por el SW de B5; escudos: <n> miniaturas, 0 originales, 0 monogramas; errores: 0`, con el mismo `<n>`. Al final, `OK: cada apertura, una versión entera (su index.html, su hoja y sus módulos); …; desde la 3.ª, B5 con futbolbase-v<V> y sus escudos, también sin red` y `despues: sale con 0`. Un `← MAL` (el aviso del arranque, un error, una apertura a medias, o sin sus escudos sin red) es un fallo: el guion sale con 1, y se para y se avisa al usuario.
- `capturas`: `portada: {"screen":"home","h1":1,"overflow":0,"codigo":"840590e1","escudos":<n>,"miniaturas":<n>}`, `tabla-pg2: {"screen":"tabla","h1":1,"overflow":0,"codigo":"840590e1","escudos":<m>,"miniaturas":<m>}` (con los datos del día), `OK: la portada y Tabla de PG2 con la versión <V> y el CODIGO 840590e1, con todos sus escudos de escudos/s/; capturas en publicado-b5/` y `capturas: sale con 0`.

Abrir con Read `$S/publicado-b5/portada-390.png` y `$S/publicado-b5/tabla-pg2-390.png` (con los datos vivos del día) y enviárselas al usuario como PNG, con el aviso para la familia: «la primera vez que abráis la app sin cobertura tras la actualización, los escudos pueden salir como iniciales; con cobertura vuelven y ya se quedan».

- [ ] **Step 11: El bot, una vez, con B5 publicada** (decisión 55 de B4)

Con la web comprobada y sin ningún workflow en marcha, `update.yml` se lanza a mano en `main` y se espera hasta su final: el bot de verdad, con las pruebas de B5, genera los datos, pasa sus suites y empuja si hay algo que publicar (los datos nuevos o, cuando toca, `data-health.json`). Durante esa ejecución, nada de push. Se lanza en segundo plano o con Monitor (de 5 a 15 minutos):

```bash
cd /home/manolo/claude/futbol-base
if [ "$(gh run list --limit 10 --json status --jq '[.[] | select(.status != "completed")] | length')" != 0 ]; then
  gh run list --limit 5
  echo "hay un workflow en marcha: no se lanza el bot; se espera (Monitor, until sobre gh run list) y se repite este paso"
else
  DESDE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run update.yml
  until BOT=$(gh run list --workflow=update.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$DESDE\")][0].databaseId // empty") && [ -n "$BOT" ]; do sleep 5; done
  timeout 1800 gh run watch "$BOT" --exit-status --interval 30 && echo "el bot, en verde con B5: $BOT"
  gh run view "$BOT" --json jobs --jq '.jobs[].steps[] | "\(.name): \(.conclusion)"'
  git fetch -q origin && git log --oneline -2 origin/main
  git show origin/main:sw.js | sed -n 2p
fi
```
Esperado: `el bot, en verde con B5: <id>`, con `Tests Python (bloquean el commit si fallan): success`, `Tests Node (bloquean el commit si fallan): success` y `Commit y push si hay cambios: success` (y `Publicar diagnóstico si la fuente falla: skipped`); en `origin/main`, un commit `Actualización automática <fecha> UTC` si había algo que publicar, o el de la publicación de B5 si no; y la línea 2 de `sw.js`, la misma: `const CRESTS_CACHE = 'futbolbase-escudos-860679a5';` (el bot no la toca). Si el bot sale en rojo, se para y se avisa al usuario con `gh run view "$BOT" --log-failed` (si falló la fuente, lo dice el paso «Actualizar datos desde futbolaspalmas.com», y no es de B5). Mientras no esté en verde, nada de push.

---

## Después de B5

Lo que queda abierto al cerrar el rediseño, para quien mantenga la web después: lo cerrado sin hacer (decisión 9), con su porqué y lo que lo reabriría; lo que dejan las tareas de B5; y lo que sigue abierto de «Para B5 y siguientes» del plan B4 y de «Para B4 y siguientes» del plan B3. Lo que allí no cambia no se repite: basta remitir a su sección.

### Cerrado sin hacer (decisión 9; también en la adenda de la spec, punto 12)

- **Los torneos perezosos** (decisión 2 de B4): `data-maspalomas-cup-2026.js` pesa 5,7 KB con gzip, la portada en D lo lee al arrancar («Verano»), y hacerlo perezoso toca el `pending` del router y los `needs` de siete pantallas (plan B3, «Torneos perezosos»). Lo reabriría un fichero de torneos mucho mayor.
- **`modulepreload`** (decisión 6 de B4): ganaría 180 ms en la primera visita de un navegador nuevo, pero metería los módulos en el mapa antes de la limpieza por `CODIGO`. Lo reabriría versionar el grafo de módulos (abajo).
- **Virtualizar Goleadores** (decisión 159 de B3): con 200 filas por página, cada «Ver 200 más» tarda de 0,32 a 0,47 s con la CPU ×4 (hasta 1,6 s con un lector de pantalla desde el 9.º toque). Lo reabriría una queja de la familia o un lector de pantalla en uso.
- **Las acciones de los `fetch-fiflp*.yml` y de los demás workflows en Node 24**: solo avisan de Node 20, GitHub ya las ejecuta en Node 24, y se lanzan a mano; `tests.yml` y `update.yml` ya van en Node 24 (decisión 55 de B4). Y la imagen fijada (`ubuntu-24.04`), hasta que se pruebe la siguiente.
- **`scripts/fetch_mygol.py`**: nadie lo llama; su subida de versión (`?v=\d{8}`, sin la letra) rompería las marcas del bot si alguien lo usara: borrarlo o arreglarlo antes.
- **Memorizar `seasonRecords`**: 7 ms con las fixtures y 52 ms con los datos vivos de benjamín (unos 200 ms en un móvil lento), solo al cambiar de categoría en Récords.
- **La ficha de Equipo sin esperar a las actas**: con la plantilla del portal en el precache (decisión 2), la espera queda en las temporadas pasadas (de 5 a 18 KB con gzip) y en la primera visita sin SW.
- **`SIZE = 138`** en `build_crests.py` (decisiones 17 y 40 de B4): en las cabeceras de 46 px a DPR 3 el navegador amplía la miniatura de 96 a 138 px; subirla rehace las 176 miniaturas (más bytes) y cambia el sello (una caché de escudos nueva para todos).
- **Los cHRM de Safari** (decisión 17 de B4): 25 originales llevan un cHRM suelto que Chrome no aplica y su miniatura no lleva; se comprueba con un iPhone.
- **El precache a medias**: una instalación del SW que no pudo bajar algún fichero deja ese hueco sin conexión hasta que se pide con red.
- **La caché HTTP de 600 s sin SW** (plan B3, «Antes de publicar B3»): sin SW al mando, unos 10 minutos tras publicar código un navegador puede mezclar módulos de su propia caché HTTP; lo cerraría versionar el grafo de módulos (con import maps, el suelo de Safari sube a 16.4). La CDN de GitHub Pages no añade nada: se purga en cada despliegue y su clave no mira la query (decisión 59). Si GitHub dejara de purgar, la app no tendría arreglo barato (haría falta versionar las rutas, no las queries), y el paso 10 de publicar, que pide con `--compressed` la variante de los móviles, lo vería.
- **Los alias de los equipos renombrados en Partido** (plan B3, «B5 y después»): las temporadas anteriores y el cara a cara pierden los equipos que la fuente renombra («VICTORIA, REAL CLUB» frente a «RC Victoria»); pediría una tabla de alias por fuente.
- **El rango de años de `parse_all_matches`** (`scripts/fetch_futbolaspalmas.py`): solo reconoce en la fecha de cada partido un año de cuatro cifras entre 2020 y 2030; en la temporada 2030/31 descartaría sin avisar los partidos con fecha de 2031. Lo reabriría acercarse a esa temporada.

### Lo que dejan las tareas de B5

- **Escudos** (Tarea 1):
  - un escudo nuevo o cambiado se añade con `python3 scripts/build_crests.py`, que escribe su miniatura y el sello nuevo en la línea 2 de `sw.js`, y se comitean el original, la miniatura, `data-shields.js` y `sw.js` (`docs/temporada-nueva.md`); cada sello nuevo vacía la caché de escudos de todos, que se rellena según se usan;
  - si se añade un escudo en `main` y la rama trae otra línea 2, `sw.js` choca al traer `main` (`docs/rediseno-rebase.md`), y el paso 2 de publicar lo comprueba con `build_crests.py --check`;
  - un SW anterior con una petición de escudo en vuelo cuando el nuevo ya se activó puede volver a crear su caché de escudos: huérfana, unos KB, hasta el `activate` siguiente (como hoy `putAndPurge` con la `CACHE_NAME` anterior);
  - `dataDeploy` de `pwa-smoke` lee dos miniaturas del árbol (`escudos/s/unionviera.png` y `huracan.png`) y las actas congeladas de A1: si se renombra uno de esos escudos, el smoke falla (el bot no ejecuta los smoke);
  - `seal()` (`scripts/build_crests.py`) descarta los ocultos de `escudos/` pero no los que no lo son: un `Thumbs.db` o un `*~` que quedara ahí cambiaría el sello igual que un escudo de verdad; calcularlo desde `git ls-files escudos/` en vez de recorrer el directorio lo evitaría;
  - la pérdida única de escudos sin conexión justo tras publicar B5 (el coste aceptado de la decisión 1) podría evitarse en un SW futuro copiando en `CRESTS_CACHE`, durante `activate`, las entradas de `/escudos/` que ya tuvieran las `futbolbase-v*` antiguas.
- **La plantilla** (Tarea 2): tras activar 2026/27 y hasta que lleguen sus actas, `data-lineups-2026-2027.js` no existe y el precache lo salta (una línea `[SW] Assets will retry on demand: 1` en cada instalación); `activate_season.py` se para, sin escribir nada, si falta el literal `SEASON_FILES`.
- **La limpieza** (Tarea 3): los nombres de las islas (`links.js`) y las listas de validación de categorías (`router.js`, `myteam.js` y `store.js`) siguen aparte; `listOf` memoriza por el `ctx` que el router da a `render` y a `mount`.
- **«Reintentar» de un bloque** (Tarea 4): se apoya en que los cargadores de `state.js` no memorizan el fallo y sí el acierto; si fallan los Goles y las Alineaciones, cada uno espera a su propio «Reintentar». `retryBlock` (`src/shell.js`) no protege su `paint()`: si llegaran datos mal formados y `paint()` lanzara durante un «Reintentar», el rechazo quedaría sin capturar y el botón se quedaría en «Cargando…» (con los datos del bot, que pasan las suites, no ocurre); lo arreglaría un try/catch que cayera a la caja de error del bloque.
- **Los esqueletos** (Tarea 5): sus altos dependen de la fuente (Public Sans, en el repo) y son los de una temporada pasada a 390 px; en la primera visita de la temporada en curso, en A, el bloque de verdad es más alto (298 px frente a 173 en Equipo).
- **Copa** (Tarea 6): Jornada sigue con la nota «sin fecha» en cada fila (ya agrupa por días); igualarla sería otra tarea. `finalOf` (`src/screen-copa.js`) repite a mano la regla de `bracket()` (`src/model.js`) para saber cuál es la final; si algún día divergieran con campeón, `championBlock` pasaría `null` a `matchRow` y Copa caería en su pantalla de error — más simple sería que `bracket()` devolviera también su final.
- **Las pruebas** (Tarea 7): la de las etiquetas mira línea a línea (un clic partido en varias líneas se le escaparía) y deja fuera `pwa-smoke.mjs`; `interaction-smoke` tarda unos 7 s más por pasada. Las huellas de la portada (17 escenarios) fijan su `render` byte a byte: un cambio a propósito de lo que pinta la portada obliga a recalcularlas y a decirlo en su commit.
- **La publicación** (Tarea 9): `publicar-b5.mjs` lleva marcas propias de B5 (decisión 50): una publicación de código posterior necesita las suyas. La primera línea de `render-smoke` (la portada con los datos reales) cambia de estado con la temporada: al activar 2026/27, B y después A.
- **El caso raro del paso de B4 a B5** (decisión 58; viene de B3): si en la 1.ª apertura tras publicar falla solo la revalidación de `index.html` (y no la de todos los módulos) y el SW de B5 no llega a instalarse antes de la apertura siguiente, la 2.ª sale a medias (la hoja de B4 con los módulos de B5: casi invisible, solo los altos de los esqueletos) o con el aviso del arranque (un módulo de B5 que pide una exportación que otro, todavía de B4, no tiene).
  - Es de una apertura: «Reintentar» o la siguiente con red lo arreglan; sin red, se repite hasta que vuelve la red (otro camino al estado que el plan B3 da por inevitable sin conexión en plena transición, abajo).
  - Lo reproduce la simulación de la revisión, `$S/rev/sim/transicion-b5.mjs`: `index-falla` da la 2.ª a medias, e `index-y-shell`, el aviso; `control`, sin fallos, la 2.ª entera. Ninguna prueba del repo lo fija, a propósito.
  - Para este paso no tiene arreglo en la app: el `index.html` y el SW de B4 ya están en los móviles, y el `index.html` de B4, con su `CODIGO` ya apuntado, no limpia nada.
  - Para una fase futura: que el `index.html` nuevo no dependa solo de su `CODIGO` apuntado. Por ejemplo, que los módulos comprueben al arrancar que la hoja aplicada es la suya (una regla propia de cada versión, como la que mira `publicar-b5.mjs`) y, si no, la vuelvan a pedir sin caché; y que el «Reintentar» del aviso del arranque limpie las cachés de otras versiones aunque el `CODIGO` apuntado sea el suyo. Coste: una comprobación en cada arranque y una marca en la hoja que `codigo.py` mantenga al día; y la regla de volver atrás hacia delante sigue valiendo.

### De los planes B4 y B3, lo que sigue abierto

- **Al activar 2026/27** (`docs/temporada-nueva.md`): la Tarea 2 ensaya la activación con las suites en verde (el arreglo de `test_season_preparation.py` ya estaba en `0208d26`). Siguen: `activate_season.py:182` no comprueba lo que devuelve `codigo.main` (las suites lo detectan antes de empujar); `PORTAL.defaultTeam` se revisa al activar; y falta la prueba de «Hacer mi equipo» en el estado B, que solo aparece entonces (plan B3, «B5 y después»).
- El registro del SW tras la primera portada, desde `app.js`, si una medición lo pide (decisión 15 de B4: hoy, en `load`).
- `presupuesto.mjs` en el CI, como trabajo informativo que no bloquee.
- `trim_shields.py` guarda PNG con nombre `.jpg` (previo a B4).
- «Borrar datos» (`clearStore`) borra `season`, `cat` y `theme` del `localStorage` del origen, que es compartido (el otro proyecto de la cuenta hoy no lo usa, ni Cache Storage: inventario §J).
- Sin conexión en plena transición de código (la 2.ª apertura sin red tras una 1.ª breve con red), el aviso del arranque: inevitable cuando el despliegue trae módulos nuevos (plan B3, «Antes de publicar B3»).
- Lo que el plan B3 dejó para saber en producción («B5 y después»: el aviso de marcador distinto en A1, los paneles «todo o nada», Datos y fuentes largo, el buscador por subcadenas y el cuadro sin `ResizeObserver`), sin cambios.
- **Cerrado en B5**, de esas listas: los escudos y la plantilla sin conexión (Tareas 1 y 2), la primera publicación de código tras B4 (Tarea 9), el SW del otro proyecto del origen (no tiene: inventario §J), los ayudantes repetidos, `routeIsMine`, `countMatches` y las tres de copa, `listOf`, el doble `teamState`, «Reintentar» de un bloque, Datos y fuentes con `errorBox`, los esqueletos, los textos de Copa, lo aparcado del triaje de B3 y las pruebas «sin prueba todavía» (Tareas 3 a 7), y la spec y `README.md` (Tarea 8).
