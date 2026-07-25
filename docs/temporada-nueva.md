# Arranque de una temporada nueva

Qué hacer cuando empieza la liga (septiembre/octubre). Este proyecto **nunca ha
pasado un cambio de temporada** con la arquitectura actual: el pipeline con DB se
construyó en marzo de 2026, a mitad de la 2025-26, y las temporadas anteriores se
importaron desde archivos. Así que esto es un plan, no una rutina rodada.

## Por qué hace falta hacer algo

`scripts/fetch_futbolaspalmas.py` no descubre nada por su cuenta:

- La temporada está **hardcodeada** en `main()`:
  `get_or_create_season(conn, "2025-2026", 2025, 2026, is_current=True)`.
- `process_file()` saca la lista de grupos y sus URLs de los propios
  `data-benjamin.js` / `data-prebenjamin.js`, que a su vez los genera
  `generate_js.py` desde la DB. Es un **bucle cerrado**: solo sabe refrescar los
  grupos que ya conoce.
- Las URLs de futbolaspalmas.com son slugs **sin temporada**
  (`/benjamin-segunda-fase-uno/`) y se reutilizan: la misma dirección sirve
  siempre la temporada en curso.

Sumado: en cuanto la fuente pase a 2026-27, el auto-update pediría las URLs de
los grupos de la *fase final* de 2025-26 y recibiría páginas de otra temporada.

## Qué lo impide mientras tanto

`standings_regression()` (en `fetch_futbolaspalmas.py`) rechaza sustituir una
clasificación cuando eso perdería información:

- la tabla scrapeada viene vacía;
- la jornada cae de ≥5 a ≤2 (una temporada terminada pasando a jornada 1);
- coincide menos del 50 % de los equipos (grupo reestructurado u otra liga).

Los grupos rechazados se listan al final del run. Si **ninguna** clasificación se
pudo actualizar, el script sale con error a propósito: `update.yml` publica solo
si el job va verde, así que el cambio de temporada aparece como un run rojo en
vez de colarse como una actualización normal. Nada se sobrescribe.

Tests: `scripts/tests/test_season_rollover_guard.py`.

> Señal de que ha llegado el momento: el workflow «Actualización automática»
> empieza a fallar con `CAMBIO DE TEMPORADA DETECTADO`.

## Pasos para arrancar 2026-27

### 1. Descubrir los grupos nuevos

Las dos categorías van por caminos distintos:

- **Benjamín**: la portada de futbolaspalmas.com enlaza las competiciones con
  slugs legibles. En julio de 2026 había 21 enlaces con `benjamin`, incluidos los
  de Lanzarote (`benjamin-primera-grupo-uno-lanzarote`) y Fuerteventura
  (`benjamin-segunda-grupo-uno-fuerteventura`).

  ```bash
  curl -s https://futbolaspalmas.com/ \
    | grep -oE 'https://futbolaspalmas\.com/[a-z0-9-]*benjamin[a-z0-9-]*/' | sort -u
  ```

- **Prebenjamín**: no aparece en el menú. Usa un patrón numerado propio,
  `https://futbolaspalmas.com/1prebenjaminN` (N = 1, 2, 3…). Hay que probar N
  hasta que deje de haber grupo.

Comprobar cada candidata: la clasificación se pide en
`<url>/mostrar_clasi.php` y tiene que parsearla `parse_standings`.

### 2. Sembrar la temporada en la DB

La temporada nueva se crea con sus grupos y sus URLs, y se le pasa el
`is_current`. La 2025-26 **se conserva entera** como histórica.

- `seasons`: alta de `2026-2027` con `is_current=1`, y `is_current=0` en
  `2025-2026`.
- `groups`: un alta por grupo descubierto (código, nombre, fase, isla, url).
- Los códigos de grupo son los que verá el frontend y los que usa `HISTORY`:
  conviene mantener el estilo existente (`A1`, `PG1`, …) y **no** reutilizar un
  código con significado distinto al de otra temporada (hay comprobaciones que
  dependen de que no colisionen entre temporadas).

### 3. Actualizar el scraper

- Cambiar la temporada hardcodeada de `main()` a `2026-2027`.
- Repasar `FEATURED` en `src/state.js`: el equipo destacado de MI EQUIPO
  (`Las Mesas Hu.`, grupo `PG2`) cambiará de grupo, y probablemente de
  categoría — un prebenjamín de 2025-26 es benjamín en 2026-27.

### 4. Publicar y comprobar

```bash
python3 scripts/fetch_futbolaspalmas.py      # scrapea + genera data-*.js
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs
```

Y mirarlo en el navegador antes de dar nada por bueno: que la temporada nueva
sea la que sale por defecto, que 2025-26 siga completa en el desplegable de
históricas, y que MI EQUIPO apunte al equipo correcto.

Ojo con el contrato **C4**: `generate_js.py` bumpea `?v=` y `CACHE_NAME` solo si
cambia algún `data-*.js`. Los cambios que sean solo de código (`src/`, `style.css`)
piden bump **manual** en `index.html` y en la línea 1 de `sw.js`
(formato `futbolbase-vYYYYMMDD[a-z]`).

## Lo que queda sin resolver

- El **descubrimiento no está automatizado**: el paso 1 es manual. Se puede
  automatizar cuando se vea el HTML real de la portada en temporada arrancada
  (hacerlo antes es adivinar).
- El umbral del guard (`_ROLLOVER_MIN_PLAYED = 5`) supone que una temporada
  terminada tiene ≥5 jornadas. Cierto para todos los grupos de liga; los grupos
  de copa con 1-2 rondas no quedan protegidos por esa vía, pero sí por el
  criterio de solapamiento de equipos.
