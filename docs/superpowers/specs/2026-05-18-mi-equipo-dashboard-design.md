# Diseño — Portal personal "MI EQUIPO" (Las Mesas Hu. Prebenjamín)

Fecha: 2026-05-18
Proyecto: `futbol-base` (portal fútbol base Las Palmas, GitHub Pages, SPA vanilla JS)
Estado: aprobado en brainstorming, pendiente de plan de implementación

## 1. Objetivo

Convertir el portal en un **portal personal de Las Mesas Hu. Prebenjamín**: el
equipo del usuario es el protagonista (fácil de encontrar, destacado, con vista
propia rica), y el resto de ligas quedan como contexto navegable igual que hoy.

No es un sistema de favoritos configurable: el equipo destacado es **fijo** para
todos los visitantes.

## 2. Alcance

**Dentro:**
- Nueva pestaña/sección `MI EQUIPO`, pantalla por defecto al abrir la app.
- Highlight global de "Las Mesas Hu." en todo el sitio y todas las temporadas.
- Pulido visual/móvil del header y la barra de pestañas.

**Fuera (descartado explícitamente):**
- Buscador / typeahead de equipos.
- Favoritos configurables por el visitante.
- Vista de "club entero" (benjamín + equipos B).
- Gráfico de evolución (sparkline / evolución de puesto): descartado.
- Cambios en datos: `generate_js.py`, scrapers, `data-season-*.js`, DB.

## 3. Equipo destacado (constante fija)

En `src/state.js`:

```js
export const FEATURED = { cat: 'prebenjamin', groupId: 'PG2', name: 'Las Mesas Hu.' };
```

- `name` coincide exacto con el campo `standings[i][1]` y con la clave de
  `data-shields.js` (`"Las Mesas Hu.": "lasMesasEscudo.png"`).
- Helper `isFeatured(teamName)` → `normalizeTeamName(teamName) === normalizeTeamName(FEATURED.name)`.
  Usa el `normalizeTeamName()` ya existente en `state.js`.
- El match normalizado cubre también las entradas "Las Mesas Hu." de benjamín
  (bonus deseable). **No** debe resaltar "Las Mesas B" ni "Las Mesas Hu. B"
  (son equipos distintos): `normalizeTeamName` los deja con sufijo `b`, así que
  no igualan a la constante.

## 4. Arquitectura de información y navegación

- Nueva pestaña **`⭐ MI EQUIPO`**, **primera** de la barra y **sección por
  defecto** al abrir (sustituye a Clasificaciones como inicio).
- Orden de pestañas: `⭐ MI EQUIPO · CLASIFICACIONES · JORNADAS · GOLEADORES ·
  POR ISLA · ESTADÍSTICAS`.
- MI EQUIPO **ignora** el selector de temporada y el toggle Benjamín/Prebenjamín:
  siempre muestra Las Mesas Hu. Prebenjamín de la temporada actual.
- Mientras `S.section === 'miequipo'`: se **ocultan** el toggle de categoría, el
  selector de temporada y la `stats-bar` global (40 grupos / N equipos / N
  partidos). Reaparecen en el resto de pestañas, que funcionan exactamente como
  hoy.

## 5. Dashboard "MI EQUIPO"

Mockup final validado (local, en `.superpowers/`, gitignored — efímero, no
forma parte del repo; el diseño autoritativo es esta sección §5):
`dashboard-v5.html`. Móvil-first; en escritorio el contenedor pasa a 2
columnas (CSS, sin lógica distinta).

Orden de bloques (de arriba abajo): **Hero → Calendario → Mini-tabla → Goleadores**.

### 5.1 Hero (identidad + puesto)

Una sola fila: escudo (`SHIELDS['Las Mesas Hu.']` → `escudos/lasMesasEscudo.png`,
con el fallback de iniciales de `teamBadge()` si falla), nombre "Las Mesas Hu.",
subtítulo "Prebenjamín · Grupo 2 · Gran Canaria", y a la derecha el **puesto
grande**: posición + "DE N EQUIPOS".

- Posición y N de equipos salen de la clasificación oficial: índice de la fila
  de Las Mesas en `PREBENJAMIN[PG2].standings` y `standings.length`.
- **No** lleva pills (PTS/PJ/G-E-P/dif) ni fila de forma — esa info es
  redundante (vive en Calendario y Mini-tabla).

### 5.2 Calendario (fusiona próximo + último + lista completa)

Un único bloque. Lista cronológica de todos los partidos del equipo en la
temporada, derivada de `HISTORY['PG2']` filtrando partidos donde aparece
"Las Mesas Hu." (local o visitante), ordenados por jornada y fecha.

- Cada fila: jornada (J22…), L/V (local/visitante), rival, y resultado o fecha.
- Partidos **jugados**: resultado coloreado G (verde) / E (gris) / P (rojo)
  según el resultado para Las Mesas. Tocables → abre la cronología de goles
  (`openMatchDetail` de `modals.js`) si hay entrada en `MATCH_DETAIL`.
- **Último jugado** (el más reciente con resultado): fila con fondo sutil y
  etiqueta "último".
- Separador `── PRÓXIMO ──` y a continuación el **próximo partido realzado**
  en su jornada (primera sin resultado): tarjeta ámbar con rival + escudo,
  fecha/hora/campo si están disponibles, y cuenta atrás ("EN N DÍAS").
- Partidos futuros posteriores: atenuados. Si no hay más, fila "Fin de
  temporada".
- Sin tarjetas Próximo/Último separadas → sin duplicar jornadas.
- La lista vive en un contenedor con `max-height` y scroll interno propio
  (no estira la página). Al renderizar la sección, se hace scroll **dentro de
  ese contenedor** para dejar visible el separador "PRÓXIMO" + la tarjeta del
  próximo partido.
- Caso límite: si la temporada ya terminó (no hay próximo), no se pinta
  separador ni tarjeta ámbar; el calendario muestra todos los jugados y hace
  scroll al final.

### 5.3 Mini-tabla "Su posición en el Grupo 2"

Recorte de `PREBENJAMIN[PG2].standings`:
- Ventana de filas desde `pos-3` hasta `pos+3` (recortada a los límites de la
  tabla), donde `pos` es la posición de Las Mesas.
- La fila del líder (posición 1) se muestra fija arriba **solo si** no entra ya
  en la ventana (no duplicar).
- Fila de Las Mesas resaltada (clase `.featured-team`, ver §6).
- Columnas: `# · Equipo · PTS · PJ · DIF`.
- Enlace "Ver grupo completo →" → navega a Clasificaciones con categoría
  Prebenjamín y el grupo PG2 abierto/scrolleado.

### 5.4 Goleadores del equipo

De `GOL_PREBENJ`, grupo `"PREBENJAMIN GC GRUPO 2"`, filtrando entradas con
`team === "Las Mesas Hu."` (o match normalizado). Cada entrada `s` es
`[nombre, equipo, goles, partidos_jugados]`.

- Ordenado por goles desc.
- Top 5 visible; 👑 junto al máximo goleador del equipo.
- Columnas: rank · nombre · goles · "N PJ".
- "Ver los 11 goleadores →" expande la lista completa **in-place** (toggle, sin
  navegar a otra sección). Datos reales actuales: 11 jugadores.

> Corrección respecto a memoria antigua: prebenjamín **sí** tiene goleadores
> individuales en la temporada actual (la limitación era solo para temporadas
> históricas vía Wayback).

## 6. Highlight global de "Las Mesas Hu."

En cualquier tabla de clasificación, tarjeta de partido, bracket de copa y
tabla unificada de prebenjamín — en **todas las secciones y todas las
temporadas** — la fila/entrada de "Las Mesas Hu." recibe la clase
`.featured-team`: tinte verde suave (`--accent-dim`) + borde izquierdo de
acento + nombre en negrita (mismo tratamiento que la fila resaltada de la
mini-tabla del mockup).

Implementación: aplicar la clase cuando `isFeatured(name)` sea true en los 4
builders de `src/render.js`:
- `buildStandingsTable()`
- `renderMatchCards()` (resaltar el lado home/away que sea Las Mesas)
- `buildKnockoutBracket()`
- `buildUnifiedPrebenjamin()` (en `state.js`)

## 7. Pulido visual / móvil

- **Barra de pestañas**: scrollable horizontal con scroll-snap y máscara de
  degradado a la derecha; "MI EQUIPO" primera y con acento. Arregla de paso el
  truncado de "ESTADÍSTICAS" en móvil.
- **Header compacto**: con MI EQUIPO activa, ocultos toggle de categoría,
  selector de temporada y `stats-bar`; el header reflota más corto.
- **Tema claro**: todos los componentes nuevos usan variables CSS existentes
  (`var(--card)`, `var(--accent)`, `var(--text2)`, `var(--border)`,
  `--accent-dim`, etc.), nunca colores fijos. Los valores hardcodeados de los
  mockups son solo para el prototipo. Clases nuevas con prefijo `me-`.

## 8. Mapa técnico

| Fichero | Cambio |
|---|---|
| `index.html` | Botón tab `⭐ MI EQUIPO` (1ª posición) + `<div id="sec-miequipo" class="section active">`; quitar `active` de `#sec-clasif`; bump `?v=` en todos los `<script>` de datos y app |
| `sw.js` | Bump `CACHE_NAME` a nueva versión `futbolbase-vYYYYMMDDx` |
| `src/state.js` | `S.section='miequipo'` por defecto; export `FEATURED`; export `isFeatured(name)`; helper `getFeaturedTeamData()` (fila standings, partidos desde `HISTORY['PG2']`, goleadores desde `GOL_PREBENJ`); aplicar `.featured-team` en `buildUnifiedPrebenjamin()` |
| `src/miequipo.js` (NUEVO) | `renderMiEquipo()` aislado (render.js ya ~885 líneas; módulo propio, importado por el router) |
| `src/render.js` | Importar y enrutar `miequipo` en `renderSection()`; aplicar `.featured-team` en `buildStandingsTable()`, `renderMatchCards()`, `buildKnockoutBracket()` |
| `src/init.js` | Tab MI EQUIPO activa por defecto; mostrar/ocultar controles globales y `stats-bar` según `S.section`; ajuste de la barra de tabs scrollable |
| `style.css` | Estilos `me-*` (hero, calendario, separador próximo, tarjeta próximo, goleadores), `.featured-team`, header/tabs responsive — todo con variables de tema |
| `scripts/tests/test_js_modules.mjs` | Tests para `isFeatured()` y para la extracción de datos del equipo (parseo de PG2 en `data-prebenjamin.js`, goleadores de Las Mesas en `data-goleadores.js`) |

## 9. Fuentes de datos y caveats

Todo se lee de globals ya cargados en el navegador (sin red, sin cambios de
build): `PREBENJAMIN`, `HISTORY['PG2']`, `GOL_PREBENJ`
(`"PREBENJAMIN GC GRUPO 2"`), `SHIELDS`, `MATCH_DETAIL`.

- El **hero y la mini-tabla** usan la clasificación oficial de `PREBENJAMIN`
  (fuente de verdad: 9º/15, 34 pts, 25 PJ, 11-1-13, 78:103, -25).
- El **calendario** deriva de `HISTORY['PG2']`; el **bloque de goleadores** de
  `GOL_PREBENJ`.
- Discrepancias menores de fuente son esperables (el historial reconstruido da
  ~27 jornadas / 14 equipos frente a 25 PJ / 15 equipos de la clasificación
  oficial). Regla: ante discrepancia, el hero/mini-tabla **confían en la
  clasificación oficial**; el calendario muestra lo que haya en `HISTORY`.

## 10. Reglas operacionales (recordatorio para implementación)

- **No `git push` manual mientras corre `update.yml`** (hace pull --rebase y
  conflicta). Commits locales sí.
- Bump obligatorio de `CACHE_NAME` en `sw.js` y `?v=` en `index.html` al tocar
  front/datos.
- Los `data-*.js` y per-season files **no se editan a mano** — aquí no se tocan.
- Trabajo de implementación en rama/worktree aislado, no directo sobre `main`.

## 11. Criterios de aceptación

1. Al abrir la app, la pantalla por defecto es MI EQUIPO con Las Mesas Hu.
   Prebenjamín; toggle de categoría, selector de temporada y stats-bar ocultos
   ahí.
2. Hero muestra escudo, nombre, "Prebenjamín · Grupo 2 · Gran Canaria" y el
   puesto grande correcto desde la clasificación oficial.
3. Calendario: un solo bloque, último jugado etiquetado, próximo realzado en su
   jornada con cuenta atrás, sin jornadas duplicadas; partidos jugados con
   resultado coloreado y tocables → cronología si hay datos.
4. Mini-tabla: líder + ventana alrededor de Las Mesas, su fila resaltada,
   enlace al grupo completo funcional.
5. Goleadores: top 5 + 👑 al máximo, "Ver los 11" despliega el resto.
6. "Las Mesas Hu." resaltado en clasificaciones, jornadas, brackets y tabla
   unificada, en temporada actual e históricas; "Las Mesas B" NO resaltado.
7. Barra de pestañas scrollable; "ESTADÍSTICAS" ya no se corta en móvil.
8. Tema claro y oscuro correctos en todos los componentes nuevos.
9. El resto de pestañas funcionan igual que antes (sin regresiones).
10. Tests nuevos pasan; suite existente sigue verde
    (`node --test scripts/tests/test_js_modules.mjs`, `python3 -m pytest scripts/tests/`).
